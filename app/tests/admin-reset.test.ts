import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { users } from "@/db/schema";
import { resetAdminPassword } from "@/lib/admin-reset";
import { attemptLogin, createSession, getSessionUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { insertUserRow, makeTestDb } from "./helpers";

const OLD = "kata-sandi-lama-123";
const NEW = "kata-sandi-baru-456";
let db: AppDb;
let hash: string;

beforeEach(async () => {
  db = makeTestDb();
  hash ??= await hashPassword(OLD);
});

const login = (email: string, password: string) =>
  attemptLogin({ email, password, ip: `ip-${Math.random()}` }, db);

describe("resetAdminPassword (npm run admin:reset)", () => {
  it("satu Admin, tanpa email: akun itu direset; sesi lama tercabut; kata sandi lama tidak berlaku; yang baru berlaku", async () => {
    const admin = insertUserRow(db, { email: "admin@uji.lokal", role: "admin", passwordHash: hash, mustChangePassword: true });
    const session = createSession(admin.id, db);
    expect(getSessionUser(session.token, db)).not.toBeNull();

    const r = await resetAdminPassword({ newPassword: NEW }, db);
    expect(r).toEqual({ ok: true, email: "admin@uji.lokal" });
    expect(getSessionUser(session.token, db)).toBeNull();
    expect((await login("admin@uji.lokal", OLD)).ok).toBe(false);
    const fresh = await login("admin@uji.lokal", NEW);
    expect(fresh.ok && fresh.user.mustChangePassword).toBe(false); // Admin sendiri yang memilih kata sandinya
  });

  it("kata sandi baru tersimpan sebagai hash argon2id, bukan teks", async () => {
    insertUserRow(db, { email: "admin@uji.lokal", role: "admin", passwordHash: hash });
    await resetAdminPassword({ newPassword: NEW }, db);
    const row = db.select().from(users).get()!;
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row.passwordHash).not.toContain(NEW);
  });

  it("lebih dari satu Admin tanpa email: ditolak; dengan email: hanya yang dipilih yang berubah", async () => {
    insertUserRow(db, { email: "a@uji.lokal", role: "admin", passwordHash: hash });
    insertUserRow(db, { email: "b@uji.lokal", role: "admin", passwordHash: hash });
    expect(await resetAdminPassword({ newPassword: NEW }, db)).toEqual({ ok: false, error: expect.stringContaining("lebih dari satu Admin") });
    expect((await login("a@uji.lokal", OLD)).ok).toBe(true);
    expect(await resetAdminPassword({ email: " B@Uji.Lokal ", newPassword: NEW }, db)).toEqual({ ok: true, email: "b@uji.lokal" });
    expect((await login("a@uji.lokal", OLD)).ok).toBe(true); // tidak tersentuh
    expect((await login("b@uji.lokal", OLD)).ok).toBe(false);
    expect((await login("b@uji.lokal", NEW)).ok).toBe(true);
  });

  it("hanya akun Admin: email Marketing ditolak dan akunnya tidak berubah", async () => {
    insertUserRow(db, { email: "admin@uji.lokal", role: "admin", passwordHash: hash });
    insertUserRow(db, { email: "marketing@uji.lokal", role: "marketing", passwordHash: hash });
    const r = await resetAdminPassword({ email: "marketing@uji.lokal", newPassword: NEW }, db);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Tidak ada akun Admin") });
    expect((await login("marketing@uji.lokal", OLD)).ok).toBe(true);
  });

  it("kata sandi yang lemah ditolak dan tidak ada yang berubah", async () => {
    insertUserRow(db, { email: "admin@uji.lokal", role: "admin", passwordHash: hash });
    expect(await resetAdminPassword({ newPassword: "pendek" }, db)).toEqual({ ok: false, error: expect.stringContaining("minimal 12") });
    expect((await login("admin@uji.lokal", OLD)).ok).toBe(true);
  });

  it("belum ada Admin: pesan yang mengarahkan ke db:seed", async () => {
    expect(await resetAdminPassword({ newPassword: NEW }, db)).toEqual({ ok: false, error: expect.stringContaining("db:seed") });
  });

  it("Admin yang terkunci di luar (nonaktif) bisa dipulihkan dari terminal", async () => {
    insertUserRow(db, { email: "admin@uji.lokal", role: "admin", passwordHash: hash, active: false });
    expect((await resetAdminPassword({ newPassword: NEW }, db)).ok).toBe(true);
    expect((await login("admin@uji.lokal", NEW)).ok).toBe(true);
  });

  it("tidak pernah memuat kata sandi di hasilnya", async () => {
    insertUserRow(db, { email: "admin@uji.lokal", role: "admin", passwordHash: hash });
    const r = await resetAdminPassword({ newPassword: NEW }, db);
    expect(JSON.stringify(r)).not.toContain(NEW);
    expect(db.select().from(users).where(eq(users.role, "admin")).get()!.mustChangePassword).toBe(false);
  });
});
