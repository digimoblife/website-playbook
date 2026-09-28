// Menjalankan semua skenario screenshot otomatis (Langkah 6e), mis. dari cron di VPS setiap malam:
//   15 2 * * * cd /jalur/app && npm run --silent screenshot:jalankan
// Hanya mencetak id entri dan status, tidak pernah isi skenario atau nilai rahasia.
import { loadEnvConfig } from "@next/env";
import { createDb, databasePath } from "../src/db/client";
import { listScenarioEntryIds, runScenario } from "../src/lib/screenshot-runner";

loadEnvConfig(process.cwd());

async function main(): Promise<number> {
  const { db, sqlite } = createDb(databasePath());
  let failed = 0;
  try {
    const ids = listScenarioEntryIds(db);
    for (const id of ids) {
      const outcome = await runScenario(id, null, db);
      if (outcome.status === "gagal") failed += 1;
      console.log(`Entri ${id}: ${outcome.status === "berhasil" ? `berhasil (${outcome.photos} foto)` : `gagal: ${outcome.error}`}`);
    }
    console.log(`Selesai: ${ids.length} skenario, ${failed} gagal.`);
  } finally {
    sqlite.close();
  }
  return failed > 0 ? 1 : 0;
}

main().then((code) => process.exit(code));
