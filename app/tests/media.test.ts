import { mkdtempSync, readdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, entryHistory, entrySteps, media } from "@/db/schema";
import { archiveEntry, createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { canView } from "@/lib/access";
import {
  deleteImage,
  detectImageType,
  getMediaForViewer,
  isStoredName,
  mimeForStoredName,
  readStoredImage,
  saveImage,
} from "@/lib/media";
import type { Role } from "@/lib/domain";
import {
  ALL_ROLES,
  combos,
  comboSlug,
  fakeGif,
  fakeJpeg,
  fakePng,
  fakeWebp,
  insertUserRow,
  makeTestDb,
  seedAllCombos,
  validInput,
} from "./helpers";

const MB = 1024 * 1024;
let db: AppDb;
let dir: string;
let adminId: number;
let entryId: number;

beforeEach(() => {
  db = makeTestDb();
  dir = mkdtempSync(join(tmpdir(), "playbook-media-"));
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  const r = createEntry({ title: "Fitur Uji", actorId: adminId }, db);
  if (!r.ok) throw new Error(r.error);
  entryId = r.id;
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const save = (bytes: Uint8Array, kind?: string, id = entryId) =>
  saveImage({ entryId: id, bytes, kind, actorId: adminId }, { dir, db });

describe("detectImageType: dari isi berkas", () => {
  it("mengenali PNG, JPEG, WebP, dan GIF (87a dan 89a)", () => {
    expect(detectImageType(fakePng())).toBe("png");
    expect(detectImageType(fakeJpeg())).toBe("jpeg");
    expect(detectImageType(fakeWebp())).toBe("webp");
    expect(detectImageType(fakeGif())).toBe("gif");
    const gif87 = fakeGif();
    gif87[4] = 0x37;
    expect(detectImageType(gif87)).toBe("gif");
  });

  it("menolak SVG, HTML, teks, PDF, dan berkas kosong", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(detectImageType(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectImageType(enc('<?xml version="1.0"?><svg/>'))).toBeNull();
    expect(detectImageType(enc("<html><body>x</body></html>"))).toBeNull();
    expect(detectImageType(enc("bukan gambar sama sekali"))).toBeNull();
    expect(detectImageType(enc("%PDF-1.7"))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });

  it("RIFF yang bukan WebP (mis. WAV) ditolak", () => {
    const wav = new Uint8Array(32);
    wav.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]); // RIFF....WAVE
    expect(detectImageType(wav)).toBeNull();
  });

  it("magic bytes yang terpotong (kurang dari tanda tangan penuh) ditolak", () => {
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("saveImage: unggahan sah", () => {
  it("menyimpan PNG dengan nama acak di dalam folder media, mencatat baris media dan riwayat", async () => {
    const r = await save(fakePng());
    expect(r).toMatchObject({ ok: true, image: { kind: "screenshot" } });
    if (!r.ok) return;
    const row = db.select().from(media).where(eq(media.id, r.image.id)).get()!;
    expect(row).toMatchObject({ entryId, source: "manual", kind: "screenshot", failed: false });
    expect(isStoredName(row.filePath)).toBe(true);
    expect(row.filePath).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(readdirSync(dir)).toEqual([row.filePath]);
    expect([...readFileSync(join(dir, row.filePath))].slice(0, 8)).toEqual([...fakePng().slice(0, 8)]);
    const last = db.select().from(entryHistory).where(eq(entryHistory.entryId, entryId)).all().at(-1)!;
    expect(last.summary).toBe("Menambah gambar (PNG)");
  });

  it("dua unggahan menghasilkan dua nama acak berbeda", async () => {
    await save(fakePng());
    await save(fakePng());
    const names = readdirSync(dir);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it("jenis gambar: GIF selalu 'gif'; yang lain bisa screenshot atau gambar promosi; nilai asing menjadi screenshot", async () => {
    const kind = async (bytes: Uint8Array, requested?: string) => {
      const r = await save(bytes, requested);
      return r.ok ? r.image.kind : `gagal: ${r.error}`;
    };
    expect(await kind(fakeGif(), "screenshot")).toBe("gif");
    expect(await kind(fakeGif(), "promo")).toBe("gif");
    expect(await kind(fakePng(), "promo")).toBe("promo");
    expect(await kind(fakeJpeg(), "screenshot")).toBe("screenshot");
    expect(await kind(fakeWebp(), "gif")).toBe("screenshot"); // bukan GIF walau diminta
    expect(await kind(fakePng(), "aneh")).toBe("screenshot");
    expect(await kind(fakePng())).toBe("screenshot");
  });
});

describe("saveImage: penolakan", () => {
  const expectNothingStored = () => {
    expect(readdirSync(dir)).toEqual([]);
    expect(db.select().from(media).all()).toEqual([]);
  };

  it("SVG ditolak walau dinamai .png dan dikirim sebagai image/png", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const r = await save(svg);
    expect(r).toEqual({ ok: false, error: "Jenis berkas tidak didukung. Gunakan PNG, JPEG, WebP, atau GIF." });
    expectNothingStored();
  });

  it("berkas teks yang menyamar (jenis palsu) ditolak", async () => {
    const r = await save(new TextEncoder().encode("ini teks biasa, bukan PNG"));
    expect(r.ok).toBe(false);
    expectNothingStored();
  });

  it("berkas kosong ditolak", async () => {
    expect(await save(new Uint8Array(0))).toEqual({ ok: false, error: "Berkas kosong." });
    expectNothingStored();
  });

  it.each([
    ["PNG", () => fakePng(5 * MB + 1)],
    ["JPEG", () => fakeJpeg(5 * MB + 1)],
    ["WebP", () => fakeWebp(5 * MB + 1)],
    ["GIF", () => fakeGif(10 * MB + 1)],
  ])("%s melebihi batas ditolak", async (_label, make) => {
    const r = await save(make());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/terlalu besar/);
    expectNothingStored();
  });

  it("tepat di batas diterima: PNG/JPEG/WebP 5 MB dan GIF 10 MB", async () => {
    expect((await save(fakePng(5 * MB))).ok).toBe(true);
    expect((await save(fakeJpeg(5 * MB))).ok).toBe(true);
    expect((await save(fakeWebp(5 * MB))).ok).toBe(true);
    expect((await save(fakeGif(10 * MB))).ok).toBe(true);
  });

  it("GIF 6 MB diterima (batas GIF 10 MB) tetapi PNG 6 MB ditolak", async () => {
    expect((await save(fakeGif(6 * MB))).ok).toBe(true);
    expect((await save(fakePng(6 * MB))).ok).toBe(false);
  });

  it("maksimal 20 gambar per entri", async () => {
    for (let i = 0; i < 20; i++) expect((await save(fakePng())).ok).toBe(true);
    const r = await save(fakePng());
    expect(r).toEqual({ ok: false, error: "Maksimal 20 gambar per entri." });
    expect(readdirSync(dir)).toHaveLength(20);
  });

  it("entri tidak ada atau terarsip ditolak", async () => {
    expect(await save(fakePng(), undefined, 9999)).toEqual({ ok: false, error: "Entri tidak ditemukan." });
    archiveEntry(entryId, adminId, db);
    const r = await save(fakePng());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/diarsipkan/);
    expectNothingStored();
  });
});

describe("path traversal", () => {
  it("nama dari klien tidak punya jalur masuk: fungsi tidak menerima nama berkas sama sekali", async () => {
    // Satu-satunya masukan tekstual adalah `kind`, dan ia tidak pernah dipakai di jalur berkas.
    const r = await save(fakePng(), "../../etc/passwd");
    expect(r.ok).toBe(true);
    expect(readdirSync(dir).every(isStoredName)).toBe(true);
    expect(existsSync(join(dir, "..", "passwd"))).toBe(false);
  });

  it.each([
    "../../etc/passwd",
    "../secret.png",
    "a/../../secret.png",
    "/etc/passwd",
    "..\\..\\windows\\system.ini",
    "0123456789abcdef0123456789abcdef.png/../../x",
    "0123456789abcdef0123456789abcdef.png\0.txt",
    "0123456789abcdef0123456789abcde.png", // 31 karakter
    "0123456789ABCDEF0123456789ABCDEF.png", // huruf besar
    "0123456789abcdef0123456789abcdef.svg",
    "0123456789abcdef0123456789abcdef.png ",
    "",
  ])("readStoredImage menolak nama tidak sah: %j", async (name) => {
    expect(isStoredName(name)).toBe(false);
    expect(await readStoredImage(name, dir)).toBeNull();
  });

  it("nama yang sah tetapi berkasnya tidak ada mengembalikan null", async () => {
    expect(await readStoredImage("0123456789abcdef0123456789abcdef.png", dir)).toBeNull();
  });

  it("baris media yang dirusak (file_path berisi ../) tidak pernah menghasilkan berkas, walau untuk Admin", async () => {
    const r = await save(fakePng());
    if (!r.ok) throw new Error();
    db.update(media).set({ filePath: "../../etc/passwd" }).where(eq(media.id, r.image.id)).run();
    expect(getMediaForViewer({ role: "admin" }, r.image.id, db)).toBeNull();
  });

  it("mimeForStoredName hanya mengenali ekstensi yang kita hasilkan", () => {
    expect(mimeForStoredName("a.png")).toBe("image/png");
    expect(mimeForStoredName("a.jpg")).toBe("image/jpeg");
    expect(mimeForStoredName("a.webp")).toBe("image/webp");
    expect(mimeForStoredName("a.gif")).toBe("image/gif");
    expect(mimeForStoredName("a.svg")).toBeNull();
    expect(mimeForStoredName("a.html")).toBeNull();
  });
});

describe("deleteImage", () => {
  it("menghapus baris dan berkas, mengosongkan tautan langkah, dan mencatat riwayat", async () => {
    const r = await save(fakePng());
    if (!r.ok) throw new Error();
    saveEntry(entryId, validInput({ steps: [{ text: "Langkah bergambar", mediaId: r.image.id }] }), adminId, db);
    const name = db.select().from(media).get()!.filePath;
    expect(existsSync(join(dir, name))).toBe(true);

    expect(await deleteImage(r.image.id, adminId, { dir, db })).toEqual({ ok: true });
    expect(existsSync(join(dir, name))).toBe(false);
    expect(db.select().from(media).all()).toEqual([]);
    expect(db.select().from(entrySteps).get()).toMatchObject({ text: "Langkah bergambar", mediaId: null });
    expect(db.select().from(entryHistory).all().at(-1)!.summary).toBe("Menghapus gambar");
  });

  it("gambar tidak ada, atau milik entri terarsip, ditolak", async () => {
    expect(await deleteImage(9999, adminId, { dir, db })).toEqual({ ok: false, error: "Gambar tidak ditemukan." });
    const r = await save(fakePng());
    if (!r.ok) throw new Error();
    archiveEntry(entryId, adminId, db);
    expect((await deleteImage(r.image.id, adminId, { dir, db })).ok).toBe(false);
    expect(db.select().from(media).all()).toHaveLength(1);
  });
});

// ---------- Akses gambar ----------
describe("getMediaForViewer: matriks peran x status x audiens x terbit", () => {
  const expected = (role: Role, c: ReturnType<typeof combos>[number]) =>
    canView({ role }, c); // acuan tunggal aturan akses = canView; di bawah ada angka tetap yang independen

  it("Admin selalu boleh; Marketing dan Partner mengikuti aturan yang sama dengan entrinya", () => {
    seedAllCombos(db);
    for (const c of combos()) {
      const owner = db.select().from(entries).where(eq(entries.slug, comboSlug(c))).get()!;
      const m = db
        .insert(media)
        .values({ entryId: owner.id, kind: "screenshot", source: "manual", filePath: "0123456789abcdef0123456789abcdef.png" })
        .returning()
        .get();
      for (const role of ALL_ROLES) {
        const got = getMediaForViewer({ role }, m.id, db);
        expect(got !== null, `${role} | ${comboSlug(c)}`).toBe(expected(role, c));
      }
    }
  });

  it("angka tetap hasil hitung tangan: dari 18 gambar, Admin 18, Marketing 4, Partner 2", () => {
    seedAllCombos(db);
    // `beforeEach` sudah membuat satu entri dasar; hanya 18 entri kombinasi yang dihitung di sini.
    for (const e of db.select().from(entries).all().filter((row) => row.id !== entryId)) {
      db.insert(media).values({ entryId: e.id, kind: "screenshot", source: "manual", filePath: "0123456789abcdef0123456789abcdef.png" }).run();
    }
    const ids = db.select().from(media).all().map((m) => m.id);
    const count = (role: Role) => ids.filter((id) => getMediaForViewer({ role }, id, db)).length;
    expect(count("admin")).toBe(18);
    expect(count("marketing")).toBe(4);
    expect(count("partner")).toBe(2);
  });

  it("gambar milik entri terarsip: hanya Admin", async () => {
    const r = await save(fakePng());
    if (!r.ok) throw new Error();
    saveEntry(entryId, validInput({ status: "siap", audience: "partner" }), adminId, db);
    publishEntry(entryId, adminId, db);
    expect(getMediaForViewer({ role: "partner" }, r.image.id, db)).not.toBeNull();
    archiveEntry(entryId, adminId, db);
    expect(getMediaForViewer({ role: "admin" }, r.image.id, db)).not.toBeNull();
    expect(getMediaForViewer({ role: "marketing" }, r.image.id, db)).toBeNull();
    expect(getMediaForViewer({ role: "partner" }, r.image.id, db)).toBeNull();
  });

  it("pengguna tidak dikenal, nonaktif, atau berperan asing tidak mendapat apa pun; gambar tidak ada = null", async () => {
    const r = await save(fakePng());
    if (!r.ok) throw new Error();
    expect(getMediaForViewer(null, r.image.id, db)).toBeNull();
    expect(getMediaForViewer({ role: "admin", active: false }, r.image.id, db)).toBeNull();
    expect(getMediaForViewer({ role: "editor" as unknown as Role }, r.image.id, db)).toBeNull();
    expect(getMediaForViewer({ role: "admin" }, 9999, db)).toBeNull();
  });
});
