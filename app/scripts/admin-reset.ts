// Mereset kata sandi Admin sendiri dari terminal, untuk saat kata sandinya terlupa.
//
//   npm run admin:reset
//
// Kata sandi baru dibaca dari variabel lingkungan ADMIN_NEW_PASSWORD, atau (bila tidak ada)
// ditanyakan secara interaktif tanpa menampilkan ketikan. Kata sandi tidak disimpan di berkas
// mana pun dan tidak dicetak. Email Admin dari ADMIN_EMAIL; bila kosong dan hanya ada satu
// Admin, akun itu yang dipakai.
import { createInterface } from "node:readline/promises";
import { loadEnvConfig } from "@next/env";
import { createDb, databasePath } from "../src/db/client";
import { resetAdminPassword } from "../src/lib/admin-reset";

loadEnvConfig(process.cwd());

const CTRL_C = "\x03";
const BACKSPACE = ["\x7f", "\b"];

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error("Input interaktif butuh terminal. Isi ADMIN_NEW_PASSWORD sebagai gantinya."));
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let input = "";
    const finish = (done: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      done();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(() => resolve(input));
        if (ch === CTRL_C) return finish(() => reject(new Error("Dibatalkan.")));
        if (BACKSPACE.includes(ch)) input = input.slice(0, -1);
        else if (ch >= " ") input += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<number> {
  let password = process.env.ADMIN_NEW_PASSWORD ?? "";
  let email = process.env.ADMIN_EMAIL ?? "";

  if (!password) {
    if (!process.stdin.isTTY) {
      console.error("Isi ADMIN_NEW_PASSWORD, atau jalankan dari terminal interaktif.");
      return 1;
    }
    if (!email) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      email = (await rl.question("Email Admin (kosongkan bila hanya ada satu Admin): ")).trim();
      rl.close();
    }
    password = await promptHidden("Kata sandi baru: ");
    const again = await promptHidden("Ulangi kata sandi baru: ");
    if (password !== again) {
      console.error("Kedua kata sandi tidak sama. Tidak ada yang diubah.");
      return 1;
    }
  }

  const { db, sqlite } = createDb(databasePath());
  try {
    const result = await resetAdminPassword({ email, newPassword: password }, db);
    if (!result.ok) {
      console.error(result.error);
      return 1;
    }
    console.log(
      `Kata sandi Admin ${result.email} diganti. Semua sesi Admin itu dicabut; masuk lagi dengan kata sandi baru.`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      message.includes("no such table")
        ? "Database belum siap. Jalankan `npm run db:migrate` lebih dulu."
        : message,
    );
    process.exit(1);
  });
