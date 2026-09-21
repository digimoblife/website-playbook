// Uji semua Server Action baru (dan dua dari Langkah 1) dengan DAL yang ASLI. Yang dipalsukan
// hanya sumber cookie sesi, koneksi database, dan revalidatePath. redirect() dibiarkan asli:
// ia melempar galat khusus yang tujuannya kita baca.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDb } from "@/db/client";
import { entries, media } from "@/db/schema";
import { archiveEntry, createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { createSession } from "@/lib/auth";
import { insertUserRow, makeTestDb, makeWorld, snapshot, validInput } from "./helpers";

const state = vi.hoisted(() => ({ token: undefined as string | undefined, db: undefined as unknown }));
vi.mock("@/lib/session", () => ({
  readSessionToken: async () => state.token,
  setSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => state.db,
}));

import {
  archiveEntryAction,
  createEntryAction,
  deleteMediaAction,
  publishEntryAction,
  restoreEntryAction,
  saveEntryAction,
  unpublishEntryAction,
} from "@/app/admin/entri/actions";
import {
  createUserAction,
  resetPasswordAction,
  setActiveAction,
  updateUserAction,
} from "@/app/admin/pengguna/actions";

type Outcome = { redirect: string } | { value: unknown };

async function run(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { value: await fn() };
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return { redirect: digest.split(";")[2] };
    }
    throw error;
  }
}

const fd = (fields: Record<string, string | number>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  return form;
};

let db: AppDb;
let w: ReturnType<typeof makeWorld> & {
  draft: number;
  published: number;
  archived: number;
  mediaId: number;
  inactiveAdminToken: string;
};

beforeEach(() => {
  db = makeTestDb();
  state.db = db;
  state.token = undefined;
  const base = makeWorld(db);
  const make = (title: string, slug: string) => {
    const r = createEntry({ title, actorId: base.admin.id }, db);
    if (!r.ok) throw new Error(r.error);
    saveEntry(r.id, validInput({ title, slug }), base.admin.id, db);
    return r.id;
  };
  const draft = make("Draf Siap", "draf-siap");
  const published = make("Sudah Terbit", "sudah-terbit");
  publishEntry(published, base.admin.id, db);
  const archived = make("Sudah Arsip", "sudah-arsip");
  archiveEntry(archived, base.admin.id, db);
  const m = db
    .insert(media)
    .values({ entryId: draft, kind: "screenshot", source: "manual", filePath: "0123456789abcdef0123456789abcdef.png" })
    .returning()
    .get();
  const inactive = insertUserRow(db, { email: "admin-mati@uji.lokal", role: "admin", active: false });
  w = {
    ...base,
    draft,
    published,
    archived,
    mediaId: m.id,
    inactiveAdminToken: createSession(inactive.id, db).token,
  };
});

type Case = {
  name: string;
  call: () => Promise<unknown>;
  /** Pemeriksaan hasil saat dipanggil oleh Admin. */
  admin: (outcome: Outcome) => void;
};

const okValue = (outcome: Outcome) => {
  expect(outcome).toHaveProperty("value");
  expect((outcome as { value: { ok: boolean } }).value.ok).toBe(true);
};

const cases = (): Case[] => [
  {
    name: "createEntryAction",
    call: () => createEntryAction(undefined, fd({ title: "Entri Dari Aksi" })),
    admin: (o) => expect((o as { redirect: string }).redirect).toMatch(/^\/admin\/entri\/\d+$/),
  },
  {
    name: "saveEntryAction",
    call: () => saveEntryAction(w.draft, validInput({ title: "Judul Diubah", slug: "judul-diubah" })),
    admin: okValue,
  },
  { name: "publishEntryAction", call: () => publishEntryAction(undefined, fd({ id: w.draft })), admin: okValue },
  { name: "unpublishEntryAction", call: () => unpublishEntryAction(undefined, fd({ id: w.published })), admin: okValue },
  { name: "archiveEntryAction", call: () => archiveEntryAction(undefined, fd({ id: w.draft })), admin: okValue },
  { name: "restoreEntryAction", call: () => restoreEntryAction(undefined, fd({ id: w.archived })), admin: okValue },
  { name: "deleteMediaAction", call: () => deleteMediaAction(undefined, fd({ id: w.mediaId })), admin: okValue },
  { name: "resetPasswordAction", call: () => resetPasswordAction(undefined, fd({ id: w.marketing.id })), admin: okValue },
  {
    name: "updateUserAction",
    call: () =>
      updateUserAction(undefined, fd({ id: w.partner.id, name: "Nama Baru", email: "baru@uji.lokal", partnerName: "PT Baru" })),
    admin: okValue,
  },
  {
    name: "createUserAction (Langkah 1)",
    call: () => createUserAction(undefined, fd({ name: "Akun Baru", email: "akunbaru@uji.lokal", role: "marketing", partnerName: "" })),
    // Bentuk hasil Langkah 1: { success, tempPassword, email } (tanpa properti ok).
    admin: (o) => expect((o as { value: { tempPassword: string } }).value.tempPassword).toHaveLength(16),
  },
  {
    name: "setActiveAction (Langkah 1)",
    call: () => setActiveAction(fd({ id: w.marketing.id, active: "false" })),
    admin: (o) => expect(o).toHaveProperty("value"),
  },
];

const CALLERS = [
  ["Marketing", () => w.tokens.marketing, "/"],
  ["Partner", () => w.tokens.partner, "/"],
  ["tanpa sesi", () => undefined, "/masuk"],
  ["sesi palsu", () => "token-palsu", "/masuk"],
  ["Admin yang sudah dinonaktifkan", () => w.inactiveAdminToken, "/masuk"],
] as const;

describe("Server Action: selain Admin ditolak dan database tidak berubah", () => {
  for (const c of cases()) {
    describe(c.name, () => {
      it.each(CALLERS)("%s dialihkan dan tidak ada yang berubah", async (_who, token, target) => {
        state.token = token();
        const before = snapshot(db);
        const outcome = await run(() => cases().find((x) => x.name === c.name)!.call());
        expect(outcome).toEqual({ redirect: target });
        expect(snapshot(db)).toBe(before);
      });
    });
  }

  it("penolakan terjadi SEBELUM input dibaca: masukan rusak pun hanya menghasilkan pengalihan", async () => {
    state.token = w.tokens.partner;
    const before = snapshot(db);
    expect(await run(() => saveEntryAction(Number.NaN, "bukan objek"))).toEqual({ redirect: "/" });
    expect(await run(() => publishEntryAction(undefined, new FormData()))).toEqual({ redirect: "/" });
    expect(await run(() => resetPasswordAction(undefined, new FormData()))).toEqual({ redirect: "/" });
    expect(snapshot(db)).toBe(before);
  });
});

describe("Server Action: Admin berhasil dan database berubah", () => {
  for (const c of cases()) {
    it(c.name, async () => {
      state.token = w.tokens.admin;
      const before = snapshot(db);
      const outcome = await run(() => cases().find((x) => x.name === c.name)!.call());
      c.admin(outcome);
      expect(snapshot(db)).not.toBe(before);
    });
  }
});

describe("Server Action: perilaku khusus untuk Admin", () => {
  beforeEach(() => {
    state.token = w.tokens.admin;
  });

  it("aksi entri mengembalikan entri terbaru, dan galat dilaporkan tanpa mengubah apa pun", async () => {
    const ok = await saveEntryAction(w.draft, validInput({ title: "Judul Lain", slug: "judul-lain" }));
    expect(ok).toMatchObject({ ok: true, message: "Perubahan disimpan.", entry: { title: "Judul Lain", slug: "judul-lain" } });

    const before = snapshot(db);
    expect(await saveEntryAction(w.draft, validInput({ summary: "x".repeat(201) }))).toMatchObject({ ok: false, error: expect.stringContaining("200") });
    expect(await publishEntryAction(undefined, fd({ id: w.archived }))).toMatchObject({ ok: false });
    expect(await publishEntryAction(undefined, fd({ id: "abc" }))).toEqual({ ok: false, error: "Entri tidak valid." });
    expect(await publishEntryAction(undefined, fd({ id: 999999 }))).toEqual({ ok: false, error: "Entri tidak ditemukan." });
    expect(await restoreEntryAction(undefined, fd({ id: w.published }))).toMatchObject({ ok: false });
    expect(snapshot(db)).toBe(before);
  });

  it("publish lewat aksi menerapkan aturan publish: yang kurang disebut", async () => {
    saveEntry(w.draft, validInput({ title: "Draf Siap", slug: "draf-siap", summary: "", steps: [] }), w.admin.id, db);
    const res = await publishEntryAction(undefined, fd({ id: w.draft }));
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/Ringkasan, Cara pakai/) });
    expect(db.select().from(entries).all().find((e) => e.id === w.draft)!.isPublished).toBe(false);
  });

  it("publishEntryAction menolak entri yang tidak akan terlihat pembaca (Internal) dan database tidak berubah", async () => {
    const created = createEntry({ title: "Masih Internal", actorId: w.admin.id }, db); // Internal, Internal
    if (!created.ok) throw new Error();
    saveEntry(created.id, validInput({ title: "Masih Internal", slug: "masih-internal", status: "internal", audience: "partner" }), w.admin.id, db);
    const before = snapshot(db);
    const res = await publishEntryAction(undefined, fd({ id: created.id }));
    expect(res).toEqual({
      ok: false,
      error: "Ubah status dan audiens dari Internal dulu, baru Publish. Untuk menyimpan tanpa menampilkan, pakai Simpan.",
    });
    expect(snapshot(db)).toBe(before);
    expect(db.select().from(entries).all().find((e) => e.id === created.id)!.isPublished).toBe(false);
  });

  it("publishEntryAction: audiens Internal juga ditolak; setelah diubah dari Internal, berhasil", async () => {
    const created = createEntry({ title: "Belum Ditampilkan", actorId: w.admin.id }, db);
    if (!created.ok) throw new Error();
    saveEntry(created.id, validInput({ title: "Belum Ditampilkan", slug: "belum-ditampilkan", status: "siap", audience: "internal" }), w.admin.id, db);
    expect(await publishEntryAction(undefined, fd({ id: created.id }))).toMatchObject({ ok: false, error: expect.stringContaining("Ubah status dan audiens dari Internal dulu") });
    expect(await saveEntryAction(created.id, validInput({ title: "Belum Ditampilkan", slug: "belum-ditampilkan", status: "siap", audience: "partner" }))).toMatchObject({ ok: true });
    expect(await publishEntryAction(undefined, fd({ id: created.id }))).toMatchObject({ ok: true });
  });

  it("createEntryAction: judul kosong mengembalikan galat, bukan pengalihan", async () => {
    const outcome = await run(() => createEntryAction(undefined, fd({ title: "  " })));
    expect(outcome).toEqual({ value: { ok: false, error: "Judul wajib diisi." } });
  });

  it("reset kata sandi: sesi lama tercabut dan kata sandi lama tidak berlaku lagi", async () => {
    const { attemptLogin } = await import("@/lib/auth");
    const { hashPassword } = await import("@/lib/password");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    db.update(users).set({ passwordHash: await hashPassword("kata-sandi-lama-123") }).where(eq(users.id, w.marketing.id)).run();
    expect((await attemptLogin({ email: "marketing@uji.lokal", password: "kata-sandi-lama-123", ip: "1.1.1.1" }, db)).ok).toBe(true);

    const res = await resetPasswordAction(undefined, fd({ id: w.marketing.id }));
    expect(res).toMatchObject({ ok: true });
    const temp = (res as { tempPassword: string }).tempPassword;
    expect(temp).toHaveLength(16);

    const { getSessionUser } = await import("@/lib/auth");
    expect(getSessionUser(w.tokens.marketing, db)).toBeNull(); // sesi lama tercabut
    expect((await attemptLogin({ email: "marketing@uji.lokal", password: "kata-sandi-lama-123", ip: "2.2.2.2" }, db)).ok).toBe(false);
    const fresh = await attemptLogin({ email: "marketing@uji.lokal", password: temp, ip: "3.3.3.3" }, db);
    expect(fresh.ok && fresh.user.mustChangePassword).toBe(true);
  });

  it("Admin tidak bisa mereset atau mengubah akunnya sendiri lewat halaman pengguna", async () => {
    const before = snapshot(db);
    expect(await resetPasswordAction(undefined, fd({ id: w.admin.id }))).toMatchObject({ ok: false });
    expect(await updateUserAction(undefined, fd({ id: w.admin.id, name: "X Y", email: "x@y.id", partnerName: "" }))).toMatchObject({ ok: false });
    expect(snapshot(db)).toBe(before);
  });

  it("ubah email: harus valid dan unik; nama partner wajib untuk Partner", async () => {
    const before = snapshot(db);
    const bad = (over: Record<string, string>) =>
      updateUserAction(undefined, fd({ id: w.partner.id, name: "Nama Baru", email: "baru@uji.lokal", partnerName: "PT Baru", ...over }));
    expect(await bad({ email: "bukan-email" })).toMatchObject({ ok: false });
    expect(await bad({ email: "MARKETING@uji.lokal" })).toEqual({ ok: false, error: "Email ini sudah dipakai akun lain." });
    expect(await bad({ partnerName: " " })).toMatchObject({ ok: false });
    expect(await bad({ name: "A" })).toMatchObject({ ok: false });
    expect(snapshot(db)).toBe(before);
    expect(await bad({ email: "  Baru@Uji.Lokal " })).toMatchObject({ ok: true });
    const { users } = await import("@/db/schema");
    const row = db.select().from(users).all().find((u) => u.id === w.partner.id)!;
    expect(row).toMatchObject({ email: "baru@uji.lokal", name: "Nama Baru", partnerName: "PT Baru", role: "partner" });
  });
});
