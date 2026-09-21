import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Logger } from "drizzle-orm/logger";
import * as schema from "./schema";

export type AppDb = BetterSQLite3Database<typeof schema>;

export type CreateDbOptions = {
  /** Dipakai tes untuk merekam SQL yang dijalankan. */
  logger?: Logger;
};

export function createDb(path: string, options: CreateDbOptions = {}) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db: AppDb = drizzle(sqlite, { schema, logger: options.logger });
  return { db, sqlite };
}

export function databasePath(): string {
  // turbopackIgnore: lokasi database ditentukan saat runtime, bukan berkas yang harus ikut dibundel.
  return resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATABASE_PATH || "data/playbook.db");
}

// Satu koneksi per proses. globalThis menjaganya tetap satu saat hot reload di dev.
const globalForDb = globalThis as unknown as { __playbookDb?: AppDb };

export function getDb(): AppDb {
  if (!globalForDb.__playbookDb) {
    globalForDb.__playbookDb = createDb(databasePath()).db;
  }
  return globalForDb.__playbookDb;
}
