// Menerapkan migrasi di folder drizzle/ ke database SQLite. Aman dijalankan berulang kali.
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, databasePath } from "../src/db/client";

loadEnvConfig(process.cwd());

const path = databasePath();
const { db, sqlite } = createDb(path);
migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
sqlite.close();
console.log(`Migrasi selesai: ${path}`);
