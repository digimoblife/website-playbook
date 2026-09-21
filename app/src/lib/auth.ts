// Inti autentikasi: login, sesi, dan pembatas percobaan gagal. Tidak menyentuh cookie
// (itu tugas lib/session.ts), sehingga bisa diuji langsung dengan database sementara.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { loginAttempts, sessions, users } from "@/db/schema";
import type { Role } from "@/lib/domain";
import {
  getDummyHash,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  validateNewPassword,
  verifyPassword,
} from "@/lib/password";
import { normalizeEmail } from "@/lib/validation";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
// Batas per pasangan email+IP dan batas lebih longgar per IP (menahan tebakan ke banyak email).
export const LOGIN_LIMIT_PER_EMAIL_IP = 5;
export const LOGIN_LIMIT_PER_IP = 30;

/** Data pengguna yang boleh sampai ke halaman. Tidak pernah memuat password_hash. */
export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  partnerName: string | null;
  mustChangePassword: boolean;
  active: boolean;
};

const sessionUserColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  partnerName: users.partnerName,
  mustChangePassword: users.mustChangePassword,
  active: users.active,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ---------- Sesi ----------

export function createSession(
  userId: number,
  db: AppDb = getDb(),
  now: Date = new Date(),
): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt, createdAt: now })
    .run();
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run(); // bersih-bersih sesi kedaluwarsa
  return { token, expiresAt };
}

/** Pengguna untuk token sesi ini, atau null bila sesi tidak ada, kedaluwarsa, atau akun nonaktif. */
export function getSessionUser(
  token: string,
  db: AppDb = getDb(),
  now: Date = new Date(),
): SessionUser | null {
  if (!token) return null;
  const row = db
    .select(sessionUserColumns)
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, hashToken(token)),
        gt(sessions.expiresAt, now),
        eq(users.active, true),
      ),
    )
    .get();
  return row ?? null;
}

export function deleteSession(token: string, db: AppDb = getDb()): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export function deleteUserSessions(userId: number, db: AppDb = getDb()): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

// ---------- Pembatas percobaan login ----------

type Throttle = { key: string; limit: number };

function throttlesFor(email: string, ip: string): Throttle[] {
  return [
    { key: `ei:${email}|${ip}`, limit: LOGIN_LIMIT_PER_EMAIL_IP },
    { key: `i:${ip}`, limit: LOGIN_LIMIT_PER_IP },
  ];
}

function isLocked(db: AppDb, throttles: Throttle[], now: Date): boolean {
  const rows = db
    .select({ lockedUntil: loginAttempts.lockedUntil })
    .from(loginAttempts)
    .where(
      and(
        inArray(loginAttempts.key, throttles.map((t) => t.key)),
        gt(loginAttempts.lockedUntil, now),
      ),
    )
    .all();
  return rows.length > 0;
}

function recordFailure(db: AppDb, throttles: Throttle[], now: Date): void {
  db.transaction((tx) => {
    for (const { key, limit } of throttles) {
      const row = tx
        .select()
        .from(loginAttempts)
        .where(eq(loginAttempts.key, key))
        .get();
      const expired = !row || now.getTime() - row.windowStart.getTime() >= LOGIN_WINDOW_MS;
      const failures = expired ? 1 : row.failures + 1;
      const windowStart = expired ? now : row.windowStart;
      const lockedUntil =
        failures >= limit ? new Date(now.getTime() + LOGIN_LOCK_MS) : null;
      tx.insert(loginAttempts)
        .values({ key, failures, windowStart, lockedUntil })
        .onConflictDoUpdate({
          target: loginAttempts.key,
          set: { failures, windowStart, lockedUntil },
        })
        .run();
    }
    // Buang catatan lama supaya tabel tidak menggembung.
    tx.delete(loginAttempts)
      .where(lt(loginAttempts.windowStart, new Date(now.getTime() - 2 * LOGIN_WINDOW_MS)))
      .run();
  });
}

// ---------- Login ----------

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: SessionUser }
  | { ok: false; reason: "invalid" | "locked" };

export async function attemptLogin(
  input: { email: string; password: string; ip: string },
  db: AppDb = getDb(),
  now: Date = new Date(),
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const { password, ip } = input;
  if (!email || !password || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  const throttles = throttlesFor(email, ip);
  if (isLocked(db, throttles, now)) return { ok: false, reason: "locked" };

  const row = db.select().from(users).where(eq(users.email, email)).get();
  // Selalu memverifikasi hash (tiruan bila akun tidak ada) agar waktu respons seragam.
  const valid = await verifyPassword(row?.passwordHash ?? (await getDummyHash()), password);

  if (!row || !row.active || !valid) {
    recordFailure(db, throttles, now);
    return { ok: false, reason: "invalid" };
  }

  db.delete(loginAttempts).where(eq(loginAttempts.key, throttles[0].key)).run();
  db.update(users).set({ lastLoginAt: now }).where(eq(users.id, row.id)).run();
  const session = createSession(row.id, db, now);
  return {
    ok: true,
    ...session,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      partnerName: row.partnerName,
      mustChangePassword: row.mustChangePassword,
      active: row.active,
    },
  };
}

// ---------- Ganti kata sandi ----------

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changePassword(
  input: { userId: number; currentPassword: string; newPassword: string },
  db: AppDb = getDb(),
): Promise<ChangePasswordResult> {
  const row = db.select().from(users).where(eq(users.id, input.userId)).get();
  if (!row || !row.active) return { ok: false, error: "Akun tidak ditemukan." };

  const currentOk =
    input.currentPassword.length <= MAX_PASSWORD_LENGTH &&
    (await verifyPassword(row.passwordHash, input.currentPassword));
  if (!currentOk) return { ok: false, error: "Kata sandi saat ini salah." };

  const policyError = validateNewPassword(input.newPassword);
  if (policyError) return { ok: false, error: policyError };
  if (input.newPassword === input.currentPassword) {
    return { ok: false, error: "Kata sandi baru harus berbeda dari yang lama." };
  }

  const passwordHash = await hashPassword(input.newPassword);
  db.update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, row.id))
    .run();
  // Semua sesi lama dicabut; pemanggil membuat sesi baru untuk perangkat ini.
  deleteUserSessions(row.id, db);
  return { ok: true };
}
