import { fileURLToPath } from "node:url";
import type { Logger } from "drizzle-orm/logger";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, type AppDb } from "@/db/client";
import { entries, entryFaqs, entryHistory, entrySteps, media, sessions, users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import type { EntryInput } from "@/lib/admin-entries";
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

// ---------- Tambahan Langkah 2 ----------

/** Masukan entri yang valid dan memenuhi semua syarat publish (terlihat oleh Marketing dan Partner). */
export function validInput(over: Partial<EntryInput> = {}): EntryInput {
  return {
    title: "Fitur Uji",
    slug: "fitur-uji",
    summary: "Ringkasan uji.",
    problem: "Masalah uji.",
    forWhom: "Toko uji.",
    explanation: "Penjelasan uji.",
    promoText: "Teks promo uji.",
    canPromise: "Boleh dijanjikan A",
    cannotPromise: "Jangan dijanjikan B",
    kind: "core",
    nature: "new",
    status: "beta",
    audience: "partner",
    needsTags: [],
    steps: [{ text: "Langkah satu", mediaId: null }],
    faqs: [],
    ...over,
  };
}

/** Sidik jari seluruh isi tabel yang relevan; dipakai untuk membuktikan "database tidak berubah". */
export function snapshot(db: AppDb): string {
  return JSON.stringify({
    users: db.select().from(users).orderBy(users.id).all(),
    entries: db.select().from(entries).orderBy(entries.id).all(),
    steps: db.select().from(entrySteps).orderBy(entrySteps.id).all(),
    faqs: db.select().from(entryFaqs).orderBy(entryFaqs.id).all(),
    media: db.select().from(media).orderBy(media.id).all(),
    history: db.select().from(entryHistory).orderBy(entryHistory.id).all(),
    sessions: db.select().from(sessions).orderBy(sessions.id).all(),
  });
}

/** Admin, Marketing, dan Partner dengan sesi masing-masing. */
export function makeWorld(db: AppDb) {
  const admin = insertUserRow(db, { email: "admin@uji.lokal", name: "Admin Uji", role: "admin" });
  const marketing = insertUserRow(db, { email: "marketing@uji.lokal", name: "Marketing Uji", role: "marketing" });
  const partner = insertUserRow(db, {
    email: "partner@uji.lokal",
    name: "Partner Uji",
    role: "partner",
    partnerName: "PT Mitra",
  });
  return {
    admin,
    marketing,
    partner,
    tokens: {
      admin: createSession(admin.id, db).token,
      marketing: createSession(marketing.id, db).token,
      partner: createSession(partner.id, db).token,
    },
  };
}

// Berkas gambar minimal dengan magic bytes yang benar (isinya tidak perlu gambar utuh).
export const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function fakePng(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_HEADER);
  return bytes;
}
export function fakeGif(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  return bytes;
}
export function fakeJpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}
export function fakeWebp(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  return bytes;
}
