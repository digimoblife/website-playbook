// Pengelolaan akun oleh Admin. Fungsi di sini tidak memeriksa siapa pemanggilnya;
// pemeriksaan Admin dilakukan di server action (lib/dal.ts: requireAdmin).
import { asc, eq } from "drizzle-orm";
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
