import { fileURLToPath } from "node:url";
import type { Logger } from "drizzle-orm/logger";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, type AppDb } from "@/db/client";
import { entries, users } from "@/db/schema";
import type { Audience, Role, Status } from "@/lib/domain";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Database SQLite di memori dengan migrasi yang sama seperti produksi. */
export function makeTestDb(logger?: Logger): AppDb {
  const { db } = createDb(":memory:", { logger });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export const ALL_ROLES: Role[] = ["admin", "marketing", "partner"];
export const ALL_STATUSES: Status[] = ["internal", "beta", "siap"];
export const ALL_AUDIENCES: Audience[] = ["internal", "marketing", "partner"];
export const PUBLISHED_STATES = [true, false] as const;

export const SECRET_MARKER = "RAHASIA-JANGAN-DIJANJIKAN";

export function combos() {
  return ALL_STATUSES.flatMap((status) =>
    ALL_AUDIENCES.flatMap((audience) =>
      PUBLISHED_STATES.map((isPublished) => ({ status, audience, isPublished })),
    ),
  );
}

export function comboSlug(c: { status: string; audience: string; isPublished: boolean }) {
  return `${c.status}-${c.audience}-${c.isPublished ? "terbit" : "draf"}`;
}

/** Satu entri untuk setiap kombinasi status x audiens x terbit (18 entri). */
export function seedAllCombos(db: AppDb) {
  for (const c of combos()) {
    const slug = comboSlug(c);
    db.insert(entries)
      .values({
        slug,
        title: `Entri ${slug}`,
        summary: "ringkasan",
        canPromise: "boleh dijanjikan",
        cannotPromise: `${SECRET_MARKER}:${slug}`,
        status: c.status,
        audience: c.audience,
        isPublished: c.isPublished,
      })
      .run();
  }
}

export function insertUserRow(
  db: AppDb,
  overrides: Partial<typeof users.$inferInsert> & { email: string },
) {
  return db
    .insert(users)
    .values({
      name: "Pengguna Tes",
      passwordHash: "bukan-hash-asli",
      role: "marketing",
      ...overrides,
    })
    .returning()
    .get();
}
