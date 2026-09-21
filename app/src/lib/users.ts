// Pengelolaan akun oleh Admin. Fungsi di sini tidak memeriksa siapa pemanggilnya;
// pemeriksaan Admin dilakukan di server action (lib/dal.ts: requireAdmin).
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { users } from "@/db/schema";
import { deleteUserSessions } from "@/lib/auth";
import type { Role } from "@/lib/domain";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

export type UserListItem = {
  id: number;
  name: string;
  email: string;
  role: Role;
  partnerName: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
};

const listColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  partnerName: users.partnerName,
  active: users.active,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
};

export function listUsers(db: AppDb = getDb()): UserListItem[] {
  return db.select(listColumns).from(users).orderBy(asc(users.id)).all();
}

export type CreateUserInput = {
  name: string;
  email: string;
  role: string;
  partnerName: string;
};

export type CreateUserResult =
  | { ok: true; user: UserListItem; tempPassword: string }
  | { ok: false; error: string };

// Admin hanya membuat akun Marketing dan Partner. Akun Admin dibuat lewat skrip seed.
export async function createUser(
  input: CreateUserInput,
  db: AppDb = getDb(),
): Promise<CreateUserResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const partnerName = input.partnerName.trim();

  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: "Nama harus 2 sampai 100 karakter." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: "Alamat email tidak valid." };
  }
  if (input.role !== "marketing" && input.role !== "partner") {
    return { ok: false, error: "Pilih peran Marketing atau Partner." };
  }
  if (input.role === "partner" && (partnerName.length < 2 || partnerName.length > 100)) {
    return { ok: false, error: "Nama partner wajib diisi (2 sampai 100 karakter) untuk peran Partner." };
  }
  if (db.select({ id: users.id }).from(users).where(eq(users.email, email)).get()) {
    return { ok: false, error: "Email ini sudah terdaftar." };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const inserted = db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role: input.role,
      partnerName: input.role === "partner" ? partnerName : null,
      active: true,
      mustChangePassword: true,
    })
    .returning(listColumns)
    .get();
  return { ok: true, user: inserted, tempPassword };
}

export type SetActiveResult = { ok: true } | { ok: false; error: string };

export function setUserActive(
  input: { targetId: number; active: boolean; actingUserId: number },
  db: AppDb = getDb(),
): SetActiveResult {
  if (!input.active && input.targetId === input.actingUserId) {
    return { ok: false, error: "Anda tidak bisa menonaktifkan akun Anda sendiri." };
  }
  const target = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.targetId))
    .get();
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };

  db.update(users).set({ active: input.active }).where(eq(users.id, target.id)).run();
  // Akun yang dinonaktifkan langsung keluar dari semua perangkat.
  if (!input.active) deleteUserSessions(target.id, db);
  return { ok: true };
}

export function getUserDetail(id: number, db: AppDb = getDb()): UserListItem | null {
  return db.select(listColumns).from(users).where(eq(users.id, id)).get() ?? null;
}

export type ResetPasswordResult =
  | { ok: true; tempPassword: string; user: UserListItem }
  | { ok: false; error: string };

/**
 * Admin mereset kata sandi pengguna LAIN: kata sandi sementara baru, wajib diganti saat masuk,
 * dan semua sesi pengguna itu dicabut. Akun sendiri direset lewat "Ganti kata sandi" atau
 * `npm run admin:reset`, bukan di sini.
 */
export async function resetUserPassword(
  input: { targetId: number; actingUserId: number },
  db: AppDb = getDb(),
): Promise<ResetPasswordResult> {
  if (input.targetId === input.actingUserId) {
    return {
      ok: false,
      error: "Untuk akun Anda sendiri, pakai menu Ganti kata sandi atau `npm run admin:reset`.",
    };
  }
  const target = db.select({ id: users.id }).from(users).where(eq(users.id, input.targetId)).get();
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  db.update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, target.id))
    .run();
  deleteUserSessions(target.id, db);
  return { ok: true, tempPassword, user: getUserDetail(target.id, db)! };
}

export type UpdateUserResult =
  | { ok: true; user: UserListItem }
  | { ok: false; error: string };

/** Admin mengubah nama, email, dan nama partner pengguna LAIN. Peran tidak bisa diubah di sini. */
export function updateUserDetails(
  input: {
    targetId: number;
    actingUserId: number;
    name: string;
    email: string;
    partnerName: string;
  },
  db: AppDb = getDb(),
): UpdateUserResult {
  if (input.targetId === input.actingUserId) {
    return { ok: false, error: "Akun Anda sendiri tidak diubah lewat halaman ini." };
  }
  const target = db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, input.targetId))
    .get();
  if (!target) return { ok: false, error: "Akun tidak ditemukan." };

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const partnerName = input.partnerName.trim();
  if (name.length < 2 || name.length > 100) {
    return { ok: false, error: "Nama harus 2 sampai 100 karakter." };
  }
  if (!isValidEmail(email)) return { ok: false, error: "Alamat email tidak valid." };
  if (target.role === "partner" && (partnerName.length < 2 || partnerName.length > 100)) {
    return {
      ok: false,
      error: "Nama partner wajib diisi (2 sampai 100 karakter) untuk peran Partner.",
    };
  }
  const clash = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, target.id)))
    .get();
  if (clash) return { ok: false, error: "Email ini sudah dipakai akun lain." };

  db.update(users)
    .set({ name, email, partnerName: target.role === "partner" ? partnerName : null })
    .where(eq(users.id, target.id))
    .run();
  return { ok: true, user: getUserDetail(target.id, db)! };
}
