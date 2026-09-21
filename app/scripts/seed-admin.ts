// Membuat akun Admin pertama dari variabel lingkungan ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD.
// Tidak ada kata sandi bawaan di kode. Tidak menimpa akun yang sudah ada. Tidak mencetak kata sandi.
import { eq } from "drizzle-orm";
import { loadEnvConfig } from "@next/env";
import { createDb, databasePath } from "../src/db/client";
import { users } from "../src/db/schema";
import { hashPassword, validateNewPassword } from "../src/lib/password";
import { isValidEmail, normalizeEmail } from "../src/lib/validation";

loadEnvConfig(process.cwd());

async function main(): Promise<number> {
  const name = (process.env.ADMIN_NAME ?? "").trim();
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const password = process.env.ADMIN_PASSWORD ?? "";

  const problems: string[] = [];
  if (name.length < 2) problems.push("ADMIN_NAME wajib diisi (minimal 2 karakter).");
  if (!isValidEmail(email)) problems.push("ADMIN_EMAIL wajib berisi alamat email yang valid.");
  const passwordProblem = validateNewPassword(password);
  if (!password) problems.push("ADMIN_PASSWORD wajib diisi.");
  else if (passwordProblem) problems.push(`ADMIN_PASSWORD: ${passwordProblem}`);
  if (problems.length > 0) {
    console.error("Seed dibatalkan:\n- " + problems.join("\n- "));
    console.error("Isi nilai di .env.local (lihat .env.example), lalu jalankan ulang.");
    return 1;
  }

  const { db, sqlite } = createDb(databasePath());
  try {
    const existing = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email)).get();
    if (existing) {
      console.log(
        existing.role === "admin"
          ? `Akun Admin ${email} sudah ada; tidak ada yang diubah.`
          : `Email ${email} sudah dipakai akun lain (peran ${existing.role}); tidak ada yang diubah.`,
      );
      return existing.role === "admin" ? 0 : 1;
    }
    db.insert(users)
      .values({
        name,
        email,
        passwordHash: await hashPassword(password),
        role: "admin",
        active: true,
        mustChangePassword: false,
      })
      .run();
    console.log(`Akun Admin dibuat: ${email}`);
    console.log("Sebaiknya hapus ADMIN_PASSWORD dari .env.local sekarang.");
    return 0;
  } finally {
    sqlite.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such table")) {
      console.error("Database belum siap. Jalankan `npm run db:migrate` lebih dulu, lalu ulangi seed.");
    } else {
      console.error(`Seed gagal: ${message}`);
    }
    process.exit(1);
  });
