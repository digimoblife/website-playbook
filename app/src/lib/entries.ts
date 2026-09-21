// Lapisan query entri. Semua pembacaan entri untuk pembaca lewat sini.
//
// Dua lapis pengaman:
//  1. Filter dan pemilihan kolom dilakukan di SQL. Untuk Partner, kolom cannot_promise
//     tidak pernah di-SELECT, jadi nilainya tidak pernah keluar dari database.
//  2. Hasilnya disaring lagi dengan canView() dan dibersihkan dari cannotPromise
//     bila perannya tidak berhak, sehingga kesalahan di satu lapis tidak membocorkan data.
import { and, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries } from "@/db/schema";
import {
  canSeeCannotPromise,
  canView,
  visibleAudiences,
  type Viewer,
} from "@/lib/access";

const readerColumns = {
  id: entries.id,
  slug: entries.slug,
  title: entries.title,
  summary: entries.summary,
  explanation: entries.explanation,
  problem: entries.problem,
  forWhom: entries.forWhom,
  kind: entries.kind,
  nature: entries.nature,
  status: entries.status,
  audience: entries.audience,
  canPromise: entries.canPromise,
  promoText: entries.promoText,
  needsTags: entries.needsTags,
  isPublished: entries.isPublished,
  publishedAt: entries.publishedAt,
  archivedAt: entries.archivedAt,
  createdAt: entries.createdAt,
  updatedAt: entries.updatedAt,
};

export type EntryForReader = {
  [K in keyof typeof readerColumns]: (typeof entries.$inferSelect)[K];
} & {
  /** Ada hanya untuk Admin dan Marketing. Untuk Partner kuncinya tidak ada sama sekali. */
  cannotPromise?: string;
};

type ActiveViewer = NonNullable<Viewer>;

function columnsFor(viewer: ActiveViewer) {
  return canSeeCannotPromise(viewer)
    ? { ...readerColumns, cannotPromise: entries.cannotPromise }
    : readerColumns;
}

function visibilityFilter(viewer: ActiveViewer): SQL | undefined {
  if (viewer.role === "admin") return undefined;
  const audiences = visibleAudiences(viewer.role);
  if (audiences.length === 0) return sql`0`;
  return and(
    eq(entries.isPublished, true),
    isNull(entries.archivedAt),
    ne(entries.status, "internal"),
    inArray(entries.audience, [...audiences]),
  );
}

function finalize(viewer: ActiveViewer, row: EntryForReader): EntryForReader {
  if (canSeeCannotPromise(viewer)) return row;
  const copy = { ...row };
  delete copy.cannotPromise;
  return copy;
}

export function listEntriesFor(
  viewer: Viewer,
  db: AppDb = getDb(),
): EntryForReader[] {
  if (!viewer || viewer.active === false) return [];
  const rows: EntryForReader[] = db
    .select(columnsFor(viewer))
    .from(entries)
    .where(visibilityFilter(viewer))
    .orderBy(desc(entries.updatedAt), desc(entries.id))
    .all();
  return rows.filter((row) => canView(viewer, row)).map((row) => finalize(viewer, row));
}

/** Mengembalikan null bila entri tidak ada atau tidak boleh dilihat (keduanya tak dibedakan). */
export function getEntryBySlugFor(
  viewer: Viewer,
  slug: string,
  db: AppDb = getDb(),
): EntryForReader | null {
  if (!viewer || viewer.active === false) return null;
  const filter = visibilityFilter(viewer);
  const row: EntryForReader | undefined = db
    .select(columnsFor(viewer))
    .from(entries)
    .where(filter ? and(eq(entries.slug, slug), filter) : eq(entries.slug, slug))
    .get();
  if (!row || !canView(viewer, row)) return null;
  return finalize(viewer, row);
}
