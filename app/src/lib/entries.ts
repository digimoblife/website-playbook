// Lapisan query entri. Semua pembacaan entri untuk pembaca lewat sini.
//
// Dua lapis pengaman:
//  1. Filter dan pemilihan kolom dilakukan di SQL. Untuk Partner, kolom cannot_promise
//     tidak pernah di-SELECT, jadi nilainya tidak pernah keluar dari database.
//  2. Hasilnya disaring lagi dengan canView() dan dibersihkan dari cannotPromise
//     bila perannya tidak berhak, sehingga kesalahan di satu lapis tidak membocorkan data.
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries, entryFaqs, entrySteps, media } from "@/db/schema";
import {
  canSeeCannotPromise,
  canView,
  visibleAudiences,
  type Viewer,
} from "@/lib/access";
import type { MediaKind } from "@/lib/domain";

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

export type EntryStepForReader = { text: string; mediaId: number | null };
export type GalleryImageForReader = { id: number; kind: MediaKind };
export type EntryFaqForReader = { question: string; answer: string };

export type EntryDetailForReader = EntryForReader & {
  /** Langkah "Cara pakai", terurut posisi. */
  steps: EntryStepForReader[];
  /** Gambar entri yang tidak ditautkan ke langkah mana pun (galeri di atas). */
  images: GalleryImageForReader[];
  /** Pertanyaan yang sering diajukan, terurut posisi. Tidak dibatasi peran (beda dari Jangan dijanjikan). */
  faqs: EntryFaqForReader[];
};

/**
 * Satu-satunya pintu bagi halaman fitur untuk mengambil langkah dan gambar entri. Memanggil
 * pemeriksaan akses yang sama dengan getEntryBySlugFor (canView) lewat fungsi itu sendiri, dan
 * HANYA bila lolos baru mengambil entry_steps dan galeri gambar. Mengembalikan null bila entri
 * tidak ada atau tidak boleh dilihat, tak dibedakan — dan dalam kasus itu, tidak ada satu pun
 * query langkah atau gambar yang dijalankan, jadi tidak ada yang bisa bocor.
 */
export function getEntryDetailBySlugFor(
  viewer: Viewer,
  slug: string,
  db: AppDb = getDb(),
): EntryDetailForReader | null {
  const entry = getEntryBySlugFor(viewer, slug, db);
  if (!entry) return null;

  const steps = db
    .select({ text: entrySteps.text, mediaId: entrySteps.mediaId })
    .from(entrySteps)
    .where(eq(entrySteps.entryId, entry.id))
    .orderBy(asc(entrySteps.position))
    .all();

  // Gambar milik entri ini yang belum ditautkan ke langkah mana pun. Karena media_id di
  // entry_steps hanya boleh menunjuk gambar milik entri yang sama (lib/admin-entries.ts),
  // "id-nya dipakai di entry_steps manapun" sama artinya dengan "dipakai di langkah entri ini".
  const linkedMediaIds = steps
    .map((s) => s.mediaId)
    .filter((id): id is number => id !== null);
  const images = db
    .select({ id: media.id, kind: media.kind })
    .from(media)
    .where(
      linkedMediaIds.length > 0
        ? and(eq(media.entryId, entry.id), notInArray(media.id, linkedMediaIds))
        : eq(media.entryId, entry.id),
    )
    .orderBy(asc(media.id))
    .all();

  const faqs = db
    .select({ question: entryFaqs.question, answer: entryFaqs.answer })
    .from(entryFaqs)
    .where(eq(entryFaqs.entryId, entry.id))
    .orderBy(asc(entryFaqs.position))
    .all();

  return { ...entry, steps, images, faqs };
}

/**
 * Slug dari sebuah id entri, atau null bila tidak ada. Dipakai HANYA untuk memanggil ulang
 * getEntryBySlugFor (validasi akses) dari kode yang cuma punya entryId, mis. umpan balik
 * halaman (lib/feedback.ts). Tidak membocorkan apa pun: id yang tidak ada atau yang tidak
 * boleh dilihat viewer sama-sama berakhir null di pemanggilnya, lewat getEntryBySlugFor.
 */
export function getEntrySlugById(id: number, db: AppDb = getDb()): string | null {
  return db.select({ slug: entries.slug }).from(entries).where(eq(entries.id, id)).get()?.slug ?? null;
}
