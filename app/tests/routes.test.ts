// Uji rute media dan unggah. Yang dipalsukan hanya sumber cookie sesi dan koneksi database;
// DAL (requireAdmin/getCurrentUser), getSessionUser, canView, dan lib/media berjalan sungguhan.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { media } from "@/db/schema";
import { archiveEntry, createEntry, getEditableEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { createSession } from "@/lib/auth";
import { isStoredName, saveImage } from "@/lib/media";
import { fakeGif, fakePng, insertUserRow, makeTestDb, makeWorld, snapshot, validInput } from "./helpers";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, db: undefined as unknown }));
vi.mock("@/lib/session", () => ({
  readSessionToken: async () => state.token,
  setSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => state.db,
}));

import { GET } from "@/app/media/[id]/route";
import { POST } from "@/app/admin/entri/[id]/unggah/route";

const MB = 1024 * 1024;
let db: AppDb;
let dir: string;
let world: ReturnType<typeof makeWorld>;
const entry: Record<"open" | "draft" | "mkt" | "internal" | "archived", number> = {} as never;
const image: Record<keyof typeof entry, number> = {} as never;
const PNG = fakePng(300);

beforeEach(async () => {
  db = makeTestDb();
  state.db = db;
  state.token = undefined;
  dir = mkdtempSync(join(tmpdir(), "playbook-routes-"));
  process.env.MEDIA_DIR = dir;
  world = makeWorld(db);

  const make = async (
    key: keyof typeof entry,
    over: object,
    publish: boolean,
    archive = false,
    afterPublish?: object,
  ) => {
    const created = createEntry({ title: `Entri ${key}`, actorId: world.admin.id }, db);
    if (!created.ok) throw new Error(created.error);
    saveEntry(created.id, validInput({ title: `Entri ${key}`, slug: `entri-${key}`, ...over }), world.admin.id, db);
    const saved = await saveImage({ entryId: created.id, bytes: PNG, actorId: world.admin.id }, { dir, db });
    if (!saved.ok) throw new Error(saved.error);
    if (publish) {
      publishEntry(created.id, world.admin.id, db);
      // Pengaman: skenario "terbit" tidak boleh diam-diam menjadi draf (Publish menolak entri yang tak terlihat).
      if (!getEditableEntry(created.id, db)!.isPublished) throw new Error(`entri ${key} gagal diterbitkan`);
    }
    if (afterPublish) {
      saveEntry(created.id, validInput({ title: `Entri ${key}`, slug: `entri-${key}`, ...over, ...afterPublish }), world.admin.id, db);
    }
    if (archive) archiveEntry(created.id, world.admin.id, db);
    entry[key] = created.id;
    image[key] = saved.image.id;
  };
  await make("open", { status: "beta", audience: "partner" }, true);
  await make("draft", { status: "beta", audience: "partner" }, false);
  await make("mkt", { status: "siap", audience: "marketing" }, true);
  // "Terbit tetapi status Internal": diterbitkan saat Beta, lalu status diubah ke Internal (tetap terbit, tak terlihat).
  await make("internal", { status: "beta", audience: "partner" }, true, false, { status: "internal" });
  await make("archived", { status: "beta", audience: "partner" }, false, true);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MEDIA_DIR;
});

const get = (id: string | number) =>
  GET(new Request(`http://localhost/media/${id}`), { params: Promise.resolve({ id: String(id) }) });

describe("GET /media/[id]: akses per peran (tabel tetap)", () => {
  // Kolom: admin, marketing, partner. Ditulis tangan dari aturan blueprint, bukan dari kode.
  const TABLE: [keyof typeof entry, number, number, number][] = [
    ["open", 200, 200, 200], // terbit, Beta, audiens Marketing dan Partner
    ["draft", 200, 404, 404], // belum terbit
    ["mkt", 200, 200, 404], // terbit, audiens Marketing saja
    ["internal", 200, 404, 404], // terbit tetapi status Internal
    ["archived", 200, 404, 404], // diarsipkan
  ];

  it.each(TABLE)("gambar entri '%s': admin %i, marketing %i, partner %i", async (key, admin, marketing, partner) => {
    for (const [role, expected] of [["admin", admin], ["marketing", marketing], ["partner", partner]] as const) {
      state.token = world.tokens[role];
      const res = await get(image[key]);
      expect(res.status, `${role} -> ${key}`).toBe(expected);
    }
  });

  it("200: isi berkas, Content-Type dari jenis tervalidasi, nosniff, dan cache privat", async () => {
    state.token = world.tokens.partner;
    const res = await get(image.open);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toMatch(/private/);
    expect(res.headers.get("cache-control")).not.toMatch(/public/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("?unduh=1 meminta browser menyimpan berkas dengan nama aman; tanpa itu tetap inline", async () => {
    state.token = world.tokens.partner;
    const inline = await get(image.open);
    expect(inline.headers.get("content-disposition")).toBe("inline");
    const res = await GET(new Request(`http://localhost/media/${image.open}?unduh=1`), {
      params: Promise.resolve({ id: String(image.open) }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="lapaq-gambar-${image.open}.png"`);
  });

  it("?unduh=1 tidak melonggarkan akses: gambar yang tak boleh dilihat tetap 404", async () => {
    state.token = world.tokens.partner;
    const res = await GET(new Request(`http://localhost/media/${image.mkt}?unduh=1`), {
      params: Promise.resolve({ id: String(image.mkt) }),
    });
    expect(res.status).toBe(404);
  });

  it("GIF disajikan sebagai image/gif", async () => {
    const created = createEntry({ title: "Punya GIF", actorId: world.admin.id }, db);
    if (!created.ok) throw new Error();
    const saved = await saveImage({ entryId: created.id, bytes: fakeGif(), actorId: world.admin.id }, { dir, db });
    if (!saved.ok) throw new Error();
    state.token = world.tokens.admin;
    expect((await get(saved.image.id)).headers.get("content-type")).toBe("image/gif");
  });

  it("'tidak ada' dan 'tidak boleh' menjawab 404 yang persis sama (status, isi, dan header)", async () => {
    state.token = world.tokens.partner;
    const forbidden = await get(image.draft);
    const missing = await get(999999);
    const snap = async (r: Response) => ({
      status: r.status,
      body: await r.text(),
      headers: Object.fromEntries([...r.headers.entries()].sort()),
    });
    expect(await snap(forbidden)).toEqual(await snap(missing));
    expect(forbidden.status).toBe(404);
  });

  it("wajib login: tanpa sesi, sesi palsu, dan akun nonaktif semuanya 404", async () => {
    for (const token of [undefined, "token-palsu", ""]) {
      state.token = token;
      expect((await get(image.open)).status).toBe(404);
    }
    const inactive = insertUserRow(db, { email: "mati@uji.lokal", role: "admin", active: false });
    state.token = createSession(inactive.id, db).token;
    expect((await get(image.open)).status).toBe(404);
  });

  it("akun yang masih wajib ganti kata sandi belum boleh mengambil gambar", async () => {
    const u = insertUserRow(db, { email: "baru@uji.lokal", role: "partner", mustChangePassword: true });
    state.token = createSession(u.id, db).token;
    expect((await get(image.open)).status).toBe(404);
  });

  it("id tidak sah tidak pernah menyentuh database atau disk: 404", async () => {
    state.token = world.tokens.admin;
    for (const id of ["abc", "0", "-1", "01", "1e3", "1.5", "1/../2", "..", "%2e%2e", "99999999999", " 1", "1 ", "", "١"]) {
      expect((await get(id)).status, `id ${JSON.stringify(id)}`).toBe(404);
    }
  });

  it("Admin tetap 404 bila berkasnya hilang dari disk", async () => {
    state.token = world.tokens.admin;
    const name = db.select().from(media).where(eq(media.id, image.open)).get()!.filePath;
    rmSync(join(dir, name));
    expect((await get(image.open)).status).toBe(404);
  });

  it("baris media yang dirusak (file_path traversal) tidak menghasilkan berkas apa pun", async () => {
    state.token = world.tokens.admin;
    db.update(media).set({ filePath: "../../../../etc/passwd" }).where(eq(media.id, image.open)).run();
    expect((await get(image.open)).status).toBe(404);
  });
});

// ---------- Unggah ----------
type Extra = { headers?: Record<string, string> };
const upload = (
  id: string | number,
  file: { bytes: Uint8Array; name?: string; type?: string } | null,
  extra: Extra & { kind?: string } = {},
) => {
  const form = new FormData();
  if (file) form.set("file", new File([file.bytes as BlobPart], file.name ?? "gambar.png", { type: file.type ?? "image/png" }));
  if (extra.kind) form.set("kind", extra.kind);
  return POST(
    new Request(`http://localhost/admin/entri/${id}/unggah`, {
      method: "POST",
      body: form,
      headers: { host: "localhost", ...extra.headers },
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
};
const body = async (r: Response) => (await r.json()) as { ok: boolean; error?: string; image?: { id: number; kind: string } };

describe("POST /admin/entri/[id]/unggah", () => {
  const filesInDir = () => readdirSync(dir).filter((n) => n !== "." && n !== "..").length;

  it("Admin: PNG diterima, tersimpan dengan nama acak, dan bisa diambil kembali lewat /media", async () => {
    state.token = world.tokens.admin;
    const before = filesInDir();
    const res = await upload(entry.draft, { bytes: fakePng(500) }, { kind: "promo" });
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json).toMatchObject({ ok: true, image: { kind: "promo" } });
    expect(filesInDir()).toBe(before + 1);
    expect((await get(json.image!.id)).status).toBe(200);
  });

  it.each(["marketing", "partner"] as const)("%s ditolak (404), tidak ada berkas dan tidak ada baris database baru", async (role) => {
    state.token = world.tokens[role];
    const dbBefore = snapshot(db);
    const filesBefore = filesInDir();
    const res = await upload(entry.draft, { bytes: fakePng() });
    expect(res.status).toBe(404);
    expect(snapshot(db)).toBe(dbBefore);
    expect(filesInDir()).toBe(filesBefore);
  });

  it("tanpa sesi: 401, tidak ada perubahan", async () => {
    state.token = undefined;
    const dbBefore = snapshot(db);
    expect((await upload(entry.draft, { bytes: fakePng() })).status).toBe(401);
    expect(snapshot(db)).toBe(dbBefore);
  });

  it("SVG yang dinamai .png dan dikirim sebagai image/png ditolak", async () => {
    state.token = world.tokens.admin;
    const dbBefore = snapshot(db);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const res = await upload(entry.draft, { bytes: svg, name: "logo.png", type: "image/png" });
    expect(res.status).toBe(400);
    expect((await body(res)).error).toMatch(/tidak didukung/);
    expect(snapshot(db)).toBe(dbBefore);
  });

  it("jenis palsu: berkas teks berekstensi .png ditolak; PNG asli berekstensi .txt dan bertipe text/plain DITERIMA (yang dinilai hanya isinya)", async () => {
    state.token = world.tokens.admin;
    expect((await upload(entry.draft, { bytes: new TextEncoder().encode("bukan gambar"), name: "x.png", type: "image/png" })).status).toBe(400);
    const ok = await upload(entry.draft, { bytes: fakePng(), name: "x.txt", type: "text/plain" });
    expect(ok.status).toBe(200);
    const name = db.select().from(media).where(eq(media.id, (await body(ok)).image!.id)).get()!.filePath;
    expect(name).toMatch(/\.png$/); // ekstensi dari isi berkas, bukan dari nama kiriman
  });

  it("berkas terlalu besar ditolak (PNG 5 MB + 1); Content-Length yang jelas kelewat besar ditolak lebih awal (413)", async () => {
    state.token = world.tokens.admin;
    const dbBefore = snapshot(db);
    const big = await upload(entry.draft, { bytes: fakePng(5 * MB + 1) });
    expect(big.status).toBe(400);
    expect((await body(big)).error).toMatch(/terlalu besar/);
    const huge = await upload(entry.draft, { bytes: fakePng() }, { headers: { "content-length": String(50 * MB) } });
    expect(huge.status).toBe(413);
    expect(snapshot(db)).toBe(dbBefore);
  });

  it("path traversal lewat nama berkas: nama dari klien diabaikan, berkas tetap di folder media dengan nama acak", async () => {
    state.token = world.tokens.admin;
    const parent = join(dir, "..");
    const parentBefore = readdirSync(parent).sort();
    for (const evil of ["../../evil.png", "..\\..\\evil.png", "/etc/passwd", "a/../../../evil.png", "evil\0.png"]) {
      const res = await upload(entry.draft, { bytes: fakePng(), name: evil });
      expect(res.status, evil).toBe(200);
    }
    expect(readdirSync(parent).sort()).toEqual(parentBefore); // tidak ada berkas baru di luar folder media
    expect(existsSync(join(parent, "evil.png"))).toBe(false);
    for (const name of readdirSync(dir)) expect(isStoredName(name)).toBe(true);
  });

  it("Origin dari situs lain ditolak (403); Origin yang sama diterima", async () => {
    state.token = world.tokens.admin;
    expect((await upload(entry.draft, { bytes: fakePng() }, { headers: { origin: "https://situs-jahat.example" } })).status).toBe(403);
    expect((await upload(entry.draft, { bytes: fakePng() }, { headers: { origin: "http://localhost" } })).status).toBe(200);
    expect((await upload(entry.draft, { bytes: fakePng() }, { headers: { origin: "bukan-url" } })).status).toBe(403);
  });

  it("tanpa berkas: 400; id tidak sah: 404; entri tidak ada atau terarsip: 400", async () => {
    state.token = world.tokens.admin;
    expect((await upload(entry.draft, null)).status).toBe(400);
    expect((await upload("abc", { bytes: fakePng() })).status).toBe(404);
    expect((await upload("../1", { bytes: fakePng() })).status).toBe(404);
    expect((await upload(99999, { bytes: fakePng() })).status).toBe(400);
    const archived = await upload(entry.archived, { bytes: fakePng() });
    expect(archived.status).toBe(400);
    expect((await body(archived)).error).toMatch(/diarsipkan/);
  });

  it("gambar unggahan tidak terlihat oleh pembaca sebelum entrinya terbit dan berhak", async () => {
    state.token = world.tokens.admin;
    const res = await upload(entry.draft, { bytes: fakePng() });
    const id = (await body(res)).image!.id;
    state.token = world.tokens.partner;
    expect((await get(id)).status).toBe(404);
    state.token = world.tokens.admin;
    publishEntry(entry.draft, world.admin.id, db);
    state.token = world.tokens.partner;
    expect((await get(id)).status).toBe(200);
  });

  it("file_path yang tersimpan adalah nama acak, bukan nama asli", async () => {
    state.token = world.tokens.admin;
    const res = await upload(entry.draft, { bytes: fakePng(), name: "rahasia-pelanggan.png" });
    const row = db.select().from(media).where(eq(media.id, (await body(res)).image!.id)).get()!;
    expect(row.filePath).not.toContain("rahasia");
    expect(readFileSync(join(dir, row.filePath)).length).toBe(64);
  });
});
