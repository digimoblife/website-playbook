// Membuat peta fitur awal (entri Internal dari audit bagian 8, area A sampai D).
// Idempoten berdasarkan slug: entri yang sudah ada tidak disentuh. Tidak menghapus apa pun.
import { loadEnvConfig } from "@next/env";
import { createDb, databasePath } from "../src/db/client";
import { PETA_AREA_LABEL, PETA_FITUR, seedPetaFitur } from "../src/lib/peta-fitur";

loadEnvConfig(process.cwd());

const { db, sqlite } = createDb(databasePath());
try {
  const result = seedPetaFitur(db);
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    console.log(
      `Peta fitur awal: ${result.created.length} entri dibuat, ${result.skipped} sudah ada (tidak diubah).`,
    );
    for (const area of ["A", "B", "C", "D"] as const) {
      const items = PETA_FITUR.filter(
        (item) => item.area === area && result.created.includes(item.title),
      );
      if (items.length === 0) continue;
      console.log(`\n${area}. ${PETA_AREA_LABEL[area]} (${items.length})`);
      for (const item of items) {
        console.log(`  - ${item.title}${item.kind === "addon" ? "  [Add-on]" : ""}`);
      }
    }
    console.log("\nSemuanya berstatus Internal, beraudiens Internal, dan belum terbit.");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no such table") || message.includes("no such column")) {
    console.error("Database belum siap. Jalankan `npm run db:migrate` lebih dulu, lalu ulangi.");
  } else {
    console.error(`Seed peta fitur gagal: ${message}`);
  }
  process.exitCode = 1;
} finally {
  sqlite.close();
}
