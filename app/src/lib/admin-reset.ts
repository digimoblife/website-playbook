// Mereset kata sandi Admin sendiri dari terminal (dipakai scripts/admin-reset.ts dan tes).
// Kata sandi tidak disimpan di mana pun selain sebagai hash argon2id di database.
import { and, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { users } from "@/db/schema";
import { deleteUserSessions } from "@/lib/auth";
import { hashPassword, validateNewPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/validation";

export type ResetAdminResult = { ok: true; email: string } | { ok: false; error: string };

/**
 * Bila `email` kosong dan hanya ada satu akun Admin, akun itu yang dipakai. Semua sesi akun
 * itu dicabut. Karena Admin sendiri yang memilih kata sandinya, tidak ada kewajiban menggantinya.
 */
export async function resetAdminPassword(
  input: { email?: string; newPassword: string },
  db: AppDb = getDb(),
): Promise<ResetAdminResult> {
  const problem = validateNewPassword(input.newPassword);
  if (problem) return { ok: false, error: problem };

  const email = input.email ? normalizeEmail(input.email) : "";
  const admins = db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(email ? and(eq(users.role, "admin"), eq(users.email, email)) : eq(users.role, "admin"))
    .all();

  if (admins.length === 0) {
    return {
      ok: false,
      error: email
        ? `Tidak ada akun Admin dengan email ${email}.`
        : "Belum ada akun Admin. Buat dulu dengan `npm run db:seed`.",
    };
  }
  if (admins.length > 1) {
    return { ok: false, error: "Ada lebih dari satu Admin. Tentukan emailnya (ADMIN_EMAIL)." };
  }

  const admin = admins[0];
  const passwordHash = await hashPassword(input.newPassword);
  db.update(users)
    .set({ passwordHash, mustChangePassword: false, active: true })
    .where(eq(users.id, admin.id))
    .run();
  deleteUserSessions(admin.id, db);
  return { ok: true, email: admin.email };
}
