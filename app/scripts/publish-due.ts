// Menerbitkan entri yang jadwal publishnya sudah lewat (lib/schedule.ts). Jadwal juga dijalankan
// otomatis setiap kali halaman dibuka; skrip ini untuk cron di VPS bila jadwal harus tepat menit,
// mis. setiap 5 menit: `*/5 * * * * cd /jalur/app && npm run --silent jadwal:jalankan`.
// Hanya mencetak jumlah dan id entri, tidak pernah isi entri.
import { loadEnvConfig } from "@next/env";
import { createDb, databasePath } from "../src/db/client";
import { publishDueEntries } from "../src/lib/schedule";

loadEnvConfig(process.cwd());

const { db, sqlite } = createDb(databasePath());
const outcomes = publishDueEntries(new Date(), db);
sqlite.close();
const published = outcomes.filter((o) => o.published).map((o) => o.id);
const cancelled = outcomes.filter((o) => !o.published).map((o) => o.id);
console.log(
  `Jadwal publish: ${published.length} terbit${published.length ? ` (id ${published.join(", ")})` : ""}, ` +
    `${cancelled.length} dibatalkan${cancelled.length ? ` (id ${cancelled.join(", ")})` : ""}.`,
);
