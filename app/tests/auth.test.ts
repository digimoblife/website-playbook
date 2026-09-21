import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema";
import {
  attemptLogin,
  changePassword,
  createSession,
  deleteSession,
  getSessionUser,
  LOGIN_LIMIT_PER_EMAIL_IP,
  LOGIN_LIMIT_PER_IP,
  LOGIN_LOCK_MS,
  SESSION_TTL_MS,
} from "@/lib/auth";
import {
  generateTempPassword,
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "@/lib/password";
import { createUser, listUsers, setUserActive } from "@/lib/users";
import { insertUserRow, makeTestDb } from "./helpers";

const PASSWORD = "kata-sandi-uji-1234";
const IP = "203.0.113.7";
let db: AppDb;
let passwordHash: string;

beforeEach(async () => {
  db = makeTestDb();
  passwordHash ??= await hashPassword(PASSWORD);
});

function seedUser(over: Partial<typeof users.$inferInsert> & { email: string }) {
  return insertUserRow(db, { passwordHash, ...over });
}

describe("kata sandi", () => {
  it("di-hash dengan argon2id dan bisa diverifikasi", async () => {
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(passwordHash, PASSWORD)).toBe(true);
    expect(await verifyPassword(passwordHash, "salah")).toBe(false);
  });

  it("hash yang rusak dianggap tidak cocok, bukan melempar galat", async () => {
    expect(await verifyPassword("bukan-hash", PASSWORD)).toBe(false);
  });

  it("kata sandi sementara: 16 karakter tanpa huruf yang membingungkan, acak, dan memenuhi syarat", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).toHaveLength(16);
    expect(a).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/);
    expect(a).not.toBe(b);
    expect(validateNewPassword(a)).toBeNull();
  });

  it("syarat kata sandi baru: minimal 12 karakter", () => {
    expect(validateNewPassword("pendek")).toMatch(/minimal 12/);
    expect(validateNewPassword("x".repeat(12))).toBeNull();
    expect(validateNewPassword("x".repeat(129))).toMatch(/maksimal/);
  });
});

describe("login", () => {
  it("berhasil: membuat sesi, memperbarui last_login_at, dan tidak memuat hash", async () => {
    const u = seedUser({ email: "budi@contoh.id", name: "Budi", role: "marketing" });
    const res = await attemptLogin({ email: "budi@contoh.id", password: PASSWORD, ip: IP }, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.user).toMatchObject({ id: u.id, name: "Budi", role: "marketing" });
    expect("passwordHash" in res.user).toBe(false);
    expect(db.select().from(users).where(eq(users.id, u.id)).get()?.lastLoginAt).toBeInstanceOf(Date);

    const viaToken = getSessionUser(res.token, db);
    expect(viaToken?.id).toBe(u.id);
    expect("passwordHash" in (viaToken ?? {})).toBe(false);
  });

  it("token di cookie tidak disimpan apa adanya: yang tersimpan hanya hash-nya", async () => {
    seedUser({ email: "a@contoh.id" });
    const res = await attemptLogin({ email: "a@contoh.id", password: PASSWORD, ip: IP }, db);
    if (!res.ok) throw new Error("login gagal");
    const stored = db.select().from(sessions).all();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).not.toBe(res.token);
    expect(stored[0].id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("email tidak peka huruf besar dan spasi di ujung diabaikan", async () => {
    seedUser({ email: "budi@contoh.id" });
    const res = await attemptLogin({ email: "  Budi@Contoh.ID ", password: PASSWORD, ip: IP }, db);
    expect(res.ok).toBe(true);
  });

  it("kata sandi salah, email tidak terdaftar, dan akun nonaktif menghasilkan hasil yang sama (generik)", async () => {
    seedUser({ email: "aktif@contoh.id" });
    seedUser({ email: "mati@contoh.id", active: false });
    const salah = await attemptLogin({ email: "aktif@contoh.id", password: "salah-salah-salah", ip: IP }, db);
    const takAda = await attemptLogin({ email: "tidakada@contoh.id", password: PASSWORD, ip: IP }, db);
    const mati = await attemptLogin({ email: "mati@contoh.id", password: PASSWORD, ip: IP }, db);
    expect(salah).toEqual({ ok: false, reason: "invalid" });
    expect(takAda).toEqual({ ok: false, reason: "invalid" });
    expect(mati).toEqual({ ok: false, reason: "invalid" });
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("input kosong ditolak", async () => {
    expect(await attemptLogin({ email: "", password: "x", ip: IP }, db)).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin({ email: "a@b.id", password: "", ip: IP }, db)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("pembatas percobaan login", () => {
  const t0 = new Date("2026-09-21T10:00:00Z");

  it(`terkunci setelah ${LOGIN_LIMIT_PER_EMAIL_IP} kegagalan, bahkan dengan kata sandi benar`, async () => {
    seedUser({ email: "budi@contoh.id" });
    for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL_IP; i++) {
      const r = await attemptLogin({ email: "budi@contoh.id", password: "salah-salah-salah", ip: IP }, db, t0);
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    const locked = await attemptLogin({ email: "budi@contoh.id", password: PASSWORD, ip: IP }, db, t0);
    expect(locked).toEqual({ ok: false, reason: "locked" });
  });

  it("kunci berakhir setelah masa kunci; login benar lagi dan hitungan direset", async () => {
    seedUser({ email: "budi@contoh.id" });
    for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL_IP; i++) {
      await attemptLogin({ email: "budi@contoh.id", password: "salah-salah-salah", ip: IP }, db, t0);
    }
    const later = new Date(t0.getTime() + LOGIN_LOCK_MS + 1000);
    const ok = await attemptLogin({ email: "budi@contoh.id", password: PASSWORD, ip: IP }, db, later);
    expect(ok.ok).toBe(true);
    expect(db.select().from(loginAttempts).where(eq(loginAttempts.key, `ei:budi@contoh.id|${IP}`)).all()).toHaveLength(0);
  });

  it("kunci per email+IP tidak mengunci IP lain untuk email yang sama", async () => {
    seedUser({ email: "budi@contoh.id" });
    for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL_IP; i++) {
      await attemptLogin({ email: "budi@contoh.id", password: "salah-salah-salah", ip: IP }, db, t0);
    }
    const other = await attemptLogin({ email: "budi@contoh.id", password: PASSWORD, ip: "198.51.100.9" }, db, t0);
    expect(other.ok).toBe(true);
  });

  it(`satu IP yang menebak banyak email terkunci setelah ${LOGIN_LIMIT_PER_IP} kegagalan`, async () => {
    for (let i = 0; i < LOGIN_LIMIT_PER_IP; i++) {
      await attemptLogin({ email: `orang${i}@contoh.id`, password: "salah-salah-salah", ip: IP }, db, t0);
    }
    seedUser({ email: "baru@contoh.id" });
    const res = await attemptLogin({ email: "baru@contoh.id", password: PASSWORD, ip: IP }, db, t0);
    expect(res).toEqual({ ok: false, reason: "locked" });
  });
});

describe("sesi", () => {
  it("kedaluwarsa setelah masa berlaku", () => {
    const u = seedUser({ email: "a@contoh.id" });
    const now = new Date("2026-09-21T10:00:00Z");
    const { token, expiresAt } = createSession(u.id, db, now);
    expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);
    expect(getSessionUser(token, db, new Date(now.getTime() + SESSION_TTL_MS - 1000))?.id).toBe(u.id);
    expect(getSessionUser(token, db, new Date(now.getTime() + SESSION_TTL_MS + 1000))).toBeNull();
  });

  it("token yang salah atau kosong tidak menghasilkan pengguna", () => {
    const u = seedUser({ email: "a@contoh.id" });
    createSession(u.id, db);
    expect(getSessionUser("token-palsu", db)).toBeNull();
    expect(getSessionUser("", db)).toBeNull();
  });

  it("keluar menghapus sesi", () => {
    const u = seedUser({ email: "a@contoh.id" });
    const { token } = createSession(u.id, db);
    deleteSession(token, db);
    expect(getSessionUser(token, db)).toBeNull();
  });

  it("akun yang dinonaktifkan langsung kehilangan semua sesinya", () => {
    const admin = seedUser({ email: "admin@contoh.id", role: "admin" });
    const target = seedUser({ email: "budi@contoh.id" });
    const s1 = createSession(target.id, db);
    const s2 = createSession(target.id, db);
    expect(setUserActive({ targetId: target.id, active: false, actingUserId: admin.id }, db)).toEqual({ ok: true });
    expect(getSessionUser(s1.token, db)).toBeNull();
    expect(getSessionUser(s2.token, db)).toBeNull();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it("sesi dari akun yang nonaktif lewat cara lain juga ditolak", () => {
    const u = seedUser({ email: "a@contoh.id" });
    const { token } = createSession(u.id, db);
    db.update(users).set({ active: false }).where(eq(users.id, u.id)).run();
    expect(getSessionUser(token, db)).toBeNull();
  });
});

describe("manajemen akun oleh Admin", () => {
  it("membuat akun Marketing: kata sandi sementara, wajib ganti, hash tidak bocor ke daftar", async () => {
    const res = await createUser({ name: "Sari", email: "Sari@Contoh.id", role: "marketing", partnerName: "diabaikan" }, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tempPassword).toHaveLength(16);
    expect(res.user).toMatchObject({ email: "sari@contoh.id", role: "marketing", partnerName: null, active: true, mustChangePassword: true });
    const row = db.select().from(users).where(eq(users.id, res.user.id)).get();
    expect(row?.passwordHash).not.toContain(res.tempPassword);
    expect(await verifyPassword(row!.passwordHash, res.tempPassword)).toBe(true);
    for (const item of listUsers(db)) expect("passwordHash" in item).toBe(false);
  });

  it("membuat akun Partner menyimpan nama partner; nama partner wajib untuk Partner", async () => {
    const ok = await createUser({ name: "Rudi", email: "rudi@mitra.id", role: "partner", partnerName: "PT Mitra Jaya" }, db);
    expect(ok.ok && ok.user.partnerName).toBe("PT Mitra Jaya");
    const tanpa = await createUser({ name: "Rudi", email: "rudi2@mitra.id", role: "partner", partnerName: " " }, db);
    expect(tanpa.ok).toBe(false);
  });

  it("menolak peran admin/asing, email tidak valid, nama terlalu pendek, dan email ganda", async () => {
    const base = { name: "Sari", email: "sari@contoh.id", partnerName: "" };
    expect((await createUser({ ...base, role: "admin" }, db)).ok).toBe(false);
    expect((await createUser({ ...base, role: "editor" }, db)).ok).toBe(false);
    expect((await createUser({ ...base, role: "marketing", email: "bukan-email" }, db)).ok).toBe(false);
    expect((await createUser({ ...base, role: "marketing", name: "S" }, db)).ok).toBe(false);
    expect((await createUser({ ...base, role: "marketing" }, db)).ok).toBe(true);
    const ganda = await createUser({ ...base, role: "marketing", email: "SARI@contoh.id" }, db);
    expect(ganda).toEqual({ ok: false, error: "Email ini sudah terdaftar." });
  });

  it("Admin tidak bisa menonaktifkan dirinya sendiri; akun bisa diaktifkan lagi", () => {
    const admin = seedUser({ email: "admin@contoh.id", role: "admin" });
    const target = seedUser({ email: "budi@contoh.id" });
    expect(setUserActive({ targetId: admin.id, active: false, actingUserId: admin.id }, db).ok).toBe(false);
    expect(db.select().from(users).where(eq(users.id, admin.id)).get()?.active).toBe(true);
    setUserActive({ targetId: target.id, active: false, actingUserId: admin.id }, db);
    expect(setUserActive({ targetId: target.id, active: true, actingUserId: admin.id }, db).ok).toBe(true);
    expect(db.select().from(users).where(eq(users.id, target.id)).get()?.active).toBe(true);
    expect(setUserActive({ targetId: 9999, active: true, actingUserId: admin.id }, db).ok).toBe(false);
  });

  it("akun baru masuk dengan kata sandi sementara lalu wajib menggantinya", async () => {
    const created = await createUser({ name: "Sari", email: "sari@contoh.id", role: "marketing", partnerName: "" }, db);
    if (!created.ok) throw new Error("gagal membuat akun");
    const login = await attemptLogin({ email: "sari@contoh.id", password: created.tempPassword, ip: IP }, db);
    expect(login.ok && login.user.mustChangePassword).toBe(true);
  });
});

describe("ganti kata sandi", () => {
  it("menolak kata sandi lama yang salah, kata sandi baru yang lemah, dan yang sama dengan lama", async () => {
    const u = seedUser({ email: "a@contoh.id", mustChangePassword: true });
    const input = { userId: u.id, currentPassword: PASSWORD, newPassword: "kata-sandi-baru-9876" };
    expect(await changePassword({ ...input, currentPassword: "salah-salah-salah" }, db)).toEqual({ ok: false, error: "Kata sandi saat ini salah." });
    expect((await changePassword({ ...input, newPassword: "pendek" }, db)).ok).toBe(false);
    expect((await changePassword({ ...input, newPassword: PASSWORD }, db)).ok).toBe(false);
    expect(db.select().from(users).where(eq(users.id, u.id)).get()?.mustChangePassword).toBe(true);
  });

  it("berhasil: bendera wajib-ganti dicabut, sesi lama dicabut, kata sandi lama tidak berlaku lagi", async () => {
    const u = seedUser({ email: "a@contoh.id", mustChangePassword: true });
    const old = createSession(u.id, db);
    const res = await changePassword({ userId: u.id, currentPassword: PASSWORD, newPassword: "kata-sandi-baru-9876" }, db);
    expect(res).toEqual({ ok: true });
    expect(db.select().from(users).where(eq(users.id, u.id)).get()?.mustChangePassword).toBe(false);
    expect(getSessionUser(old.token, db)).toBeNull();
    expect((await attemptLogin({ email: "a@contoh.id", password: PASSWORD, ip: IP }, db)).ok).toBe(false);
    expect((await attemptLogin({ email: "a@contoh.id", password: "kata-sandi-baru-9876", ip: IP }, db)).ok).toBe(true);
  });
});
