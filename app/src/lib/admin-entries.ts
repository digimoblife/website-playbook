// Lapisan data untuk dashboard admin: membuat, menyunting, menerbitkan, dan mengarsipkan entri.
//
// Fungsi di sini TIDAK memeriksa siapa pemanggilnya. Pemeriksaan Admin dilakukan di setiap
// Server Action dan route handler lewat lib/dal.ts. Aturan "siapa boleh melihat apa" ada di
// lib/access.ts; modul ini hanya memanggilnya (lewat lib/publish.ts).
//
// Semua perubahan ditulis dalam satu transaksi bersama baris riwayatnya. Validasi dilakukan
// SEBELUM menulis apa pun, jadi kegagalan tidak meninggalkan perubahan setengah jadi.
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries, entryFaqs, entryHistory, entrySteps, githubImports, media, users } from "@/db/schema";
import { isVisibleToReaders, readersWhoCanView } from "@/lib/access";
import {
  AUDIENCES,
  KINDS,
  LIMITS,
  NATURES,
  NEEDS_TAG_KEYS,
  parseNeedsTags,
  STATUSES,
  type Audience,
  type Kind,
  type MediaKind,
  type Nature,
  type NeedsTagKey,
  type Status,
} from "@/lib/domain";
import { AUDIENCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { missingForPublish, publicationSummary, publishBlocker } from "@/lib/publish";
import { isValidSlug, slugify } from "@/lib/slug";

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
export type DbLike = AppDb | Tx;

export type Fail = { ok: false; error: string };
export type Result<T extends object = object> = ({ ok: true } & T) | Fail;
const fail = (error: string): Fail => ({ ok: false, error });

export type StepInput = { text: string; mediaId: number | null };
export type FaqInput = { question: string; answer: string };

export type EntryInput = {
  title: string;
  slug: string;
  summary: string;
  problem: string;
  forWhom: string;
  explanation: string;
  promoText: string;
  canPromise: string;
  cannotPromise: string;
  kind: Kind;
  nature: Nature;
  status: Status;
  audience: Audience;
  needsTags: NeedsTagKey[];
  steps: StepInput[];
  faqs: FaqInput[];
};

export type ImageInfo = { id: number; kind: MediaKind; createdAt: Date };

export type EditableEntry = EntryInput & {
  id: number;
  isPublished: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  images: ImageInfo[];
};

// ---------- Validasi input (server tidak pernah memercayai kiriman klien) ----------

export function clean(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : null;
}

export function oneLine(value: unknown): string | null {
  const text = clean(value);
  return text === null ? null : text.replace(/\s+/g, " ");
}

const LONG_FIELDS = [
  ["problem", "Masalah yang diselesaikan"],
  ["forWhom", "Untuk toko seperti apa"],
  ["explanation", "Penjelasan"],
  ["promoText", "Materi marketing"],
  ["canPromise", "Boleh dijanjikan"],
  ["cannotPromise", "Jangan dijanjikan"],
] as const;

export function parseEntryInput(raw: unknown): Result<{ input: EntryInput }> {
  if (typeof raw !== "object" || raw === null) return fail("Data tidak valid.");
  const r = raw as Record<string, unknown>;

  const title = oneLine(r.title);
  if (!title) return fail("Judul wajib diisi.");
  if (title.length > LIMITS.title) return fail(`Judul maksimal ${LIMITS.title} karakter.`);

  const slug = clean(r.slug);
  if (slug === null || !isValidSlug(slug)) {
    return fail(
      `Slug hanya boleh huruf kecil, angka, dan tanda hubung, maksimal ${LIMITS.slug} karakter.`,
    );
  }

  const summary = oneLine(r.summary);
  if (summary === null) return fail("Ringkasan tidak valid.");
  if (summary.length > LIMITS.summary) {
    return fail(`Ringkasan maksimal ${LIMITS.summary} karakter.`);
  }

  const longValues: Record<string, string> = {};
  for (const [key, label] of LONG_FIELDS) {
    const value = clean(r[key]);
    if (value === null) return fail(`${label} tidak valid.`);
    if (value.length > LIMITS.longText) {
      return fail(`${label} maksimal ${LIMITS.longText} karakter.`);
    }
    longValues[key] = value;
  }

  if (!KINDS.includes(r.kind as Kind)) return fail("Jenis tidak valid.");
  if (!NATURES.includes(r.nature as Nature)) return fail("Sifat tidak valid.");
  if (!STATUSES.includes(r.status as Status)) return fail("Status tidak valid.");
  if (!AUDIENCES.includes(r.audience as Audience)) return fail("Audiens tidak valid.");

  if (!Array.isArray(r.needsTags)) return fail("Tag kebutuhan tidak valid.");
  const tagSet = new Set<string>();
  for (const tag of r.needsTags) {
    if (typeof tag !== "string" || !NEEDS_TAG_KEYS.includes(tag as NeedsTagKey)) {
      return fail("Tag kebutuhan tidak dikenal.");
    }
    tagSet.add(tag);
  }
  const needsTags = NEEDS_TAG_KEYS.filter((key) => tagSet.has(key));

  if (!Array.isArray(r.steps)) return fail("Cara pakai tidak valid.");
  if (r.steps.length > LIMITS.steps) {
    return fail(`Maksimal ${LIMITS.steps} langkah per entri.`);
  }
  const steps: StepInput[] = [];
  for (const [index, item] of r.steps.entries()) {
    if (typeof item !== "object" || item === null) return fail(`Langkah ${index + 1} tidak valid.`);
    const step = item as Record<string, unknown>;
    const text = oneLine(step.text);
    if (!text) return fail(`Langkah ${index + 1} masih kosong. Isi atau hapus langkah itu.`);
    if (text.length > LIMITS.stepText) {
      return fail(`Langkah ${index + 1} maksimal ${LIMITS.stepText} karakter.`);
    }
    const mediaId = step.mediaId ?? null;
    if (mediaId !== null && !(Number.isInteger(mediaId) && (mediaId as number) > 0)) {
      return fail(`Gambar untuk langkah ${index + 1} tidak valid.`);
    }
    steps.push({ text, mediaId: mediaId as number | null });
  }

  if (!Array.isArray(r.faqs)) return fail("Pertanyaan yang sering diajukan tidak valid.");
  if (r.faqs.length > LIMITS.faqs) {
    return fail(`Maksimal ${LIMITS.faqs} pertanyaan yang sering diajukan per entri.`);
  }
  const faqs: FaqInput[] = [];
  for (const [index, item] of r.faqs.entries()) {
    if (typeof item !== "object" || item === null) return fail(`FAQ ${index + 1} tidak valid.`);
    const faq = item as Record<string, unknown>;
    const question = oneLine(faq.question);
    if (!question) return fail(`FAQ ${index + 1}: pertanyaan masih kosong.`);
    if (question.length > LIMITS.faqQuestion) {
      return fail(`FAQ ${index + 1}: pertanyaan maksimal ${LIMITS.faqQuestion} karakter.`);
    }
    const answer = clean(faq.answer);
    if (!answer) return fail(`FAQ ${index + 1}: jawaban masih kosong.`);
    if (answer.length > LIMITS.faqAnswer) {
      return fail(`FAQ ${index + 1}: jawaban maksimal ${LIMITS.faqAnswer} karakter.`);
    }
    faqs.push({ question, answer });
  }

  return {
    ok: true,
    input: {
      title,
      slug,
      summary,
      problem: longValues.problem,
      forWhom: longValues.forWhom,
      explanation: longValues.explanation,
      promoText: longValues.promoText,
      canPromise: longValues.canPromise,
      cannotPromise: longValues.cannotPromise,
      kind: r.kind as Kind,
      nature: r.nature as Nature,
      status: r.status as Status,
      audience: r.audience as Audience,
      needsTags,
      steps,
      faqs,
    },
  };
}

// ---------- Membaca ----------

export function loadEditable(db: DbLike, id: number): EditableEntry | null {
  const row = db.select().from(entries).where(eq(entries.id, id)).get();
  if (!row) return null;
  const steps = db
    .select({ text: entrySteps.text, mediaId: entrySteps.mediaId })
    .from(entrySteps)
    .where(eq(entrySteps.entryId, id))
    .orderBy(asc(entrySteps.position))
    .all();
  const images = db
    .select({ id: media.id, kind: media.kind, createdAt: media.createdAt })
    .from(media)
    .where(eq(media.entryId, id))
    .orderBy(asc(media.id))
    .all();
  const faqs = db
    .select({ question: entryFaqs.question, answer: entryFaqs.answer })
    .from(entryFaqs)
    .where(eq(entryFaqs.entryId, id))
    .orderBy(asc(entryFaqs.position))
    .all();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    problem: row.problem,
    forWhom: row.forWhom,
    explanation: row.explanation,
    promoText: row.promoText,
    canPromise: row.canPromise,
    cannotPromise: row.cannotPromise,
    kind: row.kind,
    nature: row.nature,
    status: row.status,
    audience: row.audience,
    needsTags: parseNeedsTags(row.needsTags),
    steps,
    faqs,
    images,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getEditableEntry(id: number, db: AppDb = getDb()): EditableEntry | null {
  return loadEditable(db, id);
}

export function logHistory(
  db: DbLike,
  entryId: number,
  userId: number,
  summary: string,
  at: Date = new Date(),
): void {
  db.insert(entryHistory).values({ entryId, userId, summary, at }).run();
}

function uniqueSlug(db: DbLike, base: string, excludeId?: number): string {
  let candidate = base;
  for (let n = 2; ; n++) {
    const clash = db
      .select({ id: entries.id })
      .from(entries)
      .where(
        excludeId === undefined
          ? eq(entries.slug, candidate)
          : and(eq(entries.slug, candidate), ne(entries.id, excludeId)),
      )
      .get();
    if (!clash) return candidate;
    const suffix = `-${n}`;
    candidate = base.slice(0, LIMITS.slug - suffix.length).replace(/-+$/, "") + suffix;
  }
}

// ---------- Menulis ----------

export function createEntry(
  input: { title: unknown; actorId: number },
  db: AppDb = getDb(),
): Result<{ id: number; slug: string }> {
  const title = oneLine(input.title);
  if (!title) return fail("Judul wajib diisi.");
  if (title.length > LIMITS.title) return fail(`Judul maksimal ${LIMITS.title} karakter.`);

  return db.transaction((tx) => {
    const slug = uniqueSlug(tx, slugify(title));
    const now = new Date();
    // Default aman dari skema: Internal, beraudiens Internal, belum terbit.
    const row = tx
      .insert(entries)
      .values({ slug, title, createdAt: now, updatedAt: now })
      .returning({ id: entries.id })
      .get();
    logHistory(tx, row.id, input.actorId, "Membuat entri", now);
    return { ok: true as const, id: row.id, slug };
  });
}

// ---------- Penarikan dari GitHub (Langkah 4-experimental) ----------

export type GithubPullDraft = {
  title: unknown;
  summary: unknown;
  problem: unknown;
  forWhom: unknown;
  explanation: unknown;
  kind: unknown;
  nature: unknown;
};

export type GithubPullInfo = { number: number; title: string; url: string };

/**
 * Membuat entri baru dari draf AI hasil penarikan PR GitHub, dalam SATU transaksi bersama baris
 * github_imports dan riwayat. status dan audience SELALU "internal" di sini — draft tidak punya
 * field itu sama sekali, jadi AI tidak mungkin menentukannya (lihat lib/ai-draft.ts).
 *
 * PR yang sama boleh ditarik berkali-kali: setiap panggilan membuat entri BARU dan baris
 * github_imports baru (pr_number sengaja TIDAK unik, lihat db/schema.ts), sehingga suntingan
 * manual Admin pada entri hasil tarikan sebelumnya tidak pernah tertimpa.
 */
export function pullFromGithub(
  pr: GithubPullInfo,
  draft: GithubPullDraft,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ id: number; slug: string }> {
  const title = (oneLine(draft.title) || oneLine(pr.title) || `PR #${pr.number}`).slice(0, LIMITS.title);
  const summary = (oneLine(draft.summary) ?? "").slice(0, LIMITS.summary);
  const problem = (clean(draft.problem) ?? "").slice(0, LIMITS.longText);
  const forWhom = (clean(draft.forWhom) ?? "").slice(0, LIMITS.longText);
  const explanation = (clean(draft.explanation) ?? "").slice(0, LIMITS.longText);
  const kind: Kind = KINDS.includes(draft.kind as Kind) ? (draft.kind as Kind) : "core";
  const nature: Nature = NATURES.includes(draft.nature as Nature) ? (draft.nature as Nature) : "new";

  return db.transaction((tx) => {
    const slug = uniqueSlug(tx, slugify(title));
    const now = new Date();
    const row = tx
      .insert(entries)
      .values({
        slug,
        title,
        summary,
        problem,
        forWhom,
        explanation,
        kind,
        nature,
        // Dipaksa, bukan dari draft: entri hasil tarikan AI selalu Internal/Internal.
        status: "internal",
        audience: "internal",
        sourcePrNumber: pr.number,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: entries.id })
      .get();

    tx.insert(githubImports)
      .values({
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        entryId: row.id,
        actorId,
        importedAt: now,
      })
      .run();

    logHistory(tx, row.id, actorId, `Ditarik dari GitHub PR #${pr.number}: ${pr.title}, draf oleh AI`, now);
    return { ok: true as const, id: row.id, slug };
  });
}

const SECTION_LABELS: [keyof EntryInput, string][] = [
  ["title", "Judul"],
  ["slug", "Slug"],
  ["summary", "Ringkasan"],
  ["problem", "Masalah yang diselesaikan"],
  ["forWhom", "Untuk toko seperti apa"],
  ["explanation", "Penjelasan"],
  ["promoText", "Materi marketing"],
  ["canPromise", "Boleh dijanjikan"],
  ["cannotPromise", "Jangan dijanjikan"],
  ["kind", "Jenis"],
  ["nature", "Sifat"],
];

export function saveEntry(
  id: number,
  raw: unknown,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ changed: boolean; entry: EditableEntry }> {
  const parsed = parseEntryInput(raw);
  if (!parsed.ok) return parsed;
  const input = parsed.input;

  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (current.archivedAt) {
      return fail("Entri ini diarsipkan. Pulihkan dulu sebelum menyunting.");
    }

    const clash = tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.slug, input.slug), ne(entries.id, id)))
      .get();
    if (clash) return fail("Slug ini sudah dipakai entri lain. Pilih slug yang berbeda.");

    const mediaIds = [...new Set(input.steps.flatMap((s) => (s.mediaId ? [s.mediaId] : [])))];
    if (mediaIds.length > 0) {
      const owned = tx
        .select({ id: media.id })
        .from(media)
        .where(and(eq(media.entryId, id), inArray(media.id, mediaIds)))
        .all();
      if (owned.length !== mediaIds.length) {
        return fail("Gambar yang dipilih untuk langkah tidak ditemukan pada entri ini.");
      }
    }

    const sections: string[] = [];
    for (const [key, label] of SECTION_LABELS) {
      if (current[key] !== input[key]) sections.push(label);
    }
    if (JSON.stringify(current.needsTags) !== JSON.stringify(input.needsTags)) {
      sections.push("Tag kebutuhan");
    }
    if (JSON.stringify(current.steps) !== JSON.stringify(input.steps)) {
      sections.push("Cara pakai");
    }
    if (JSON.stringify(current.faqs) !== JSON.stringify(input.faqs)) {
      sections.push("Pertanyaan yang sering diajukan");
    }
    const statusChanged = current.status !== input.status;
    const audienceChanged = current.audience !== input.audience;

    if (sections.length === 0 && !statusChanged && !audienceChanged) {
      return { ok: true as const, changed: false, entry: current };
    }

    const now = new Date();
    tx.update(entries)
      .set({
        title: input.title,
        slug: input.slug,
        summary: input.summary,
        problem: input.problem,
        forWhom: input.forWhom,
        explanation: input.explanation,
        promoText: input.promoText,
        canPromise: input.canPromise,
        cannotPromise: input.cannotPromise,
        kind: input.kind,
        nature: input.nature,
        status: input.status,
        audience: input.audience,
        needsTags: JSON.stringify(input.needsTags),
        updatedAt: now,
      })
      .where(eq(entries.id, id))
      .run();

    tx.delete(entrySteps).where(eq(entrySteps.entryId, id)).run();
    if (input.steps.length > 0) {
      tx.insert(entrySteps)
        .values(
          input.steps.map((step, index) => ({
            entryId: id,
            position: index + 1,
            text: step.text,
            mediaId: step.mediaId,
          })),
        )
        .run();
    }

    tx.delete(entryFaqs).where(eq(entryFaqs.entryId, id)).run();
    if (input.faqs.length > 0) {
      tx.insert(entryFaqs)
        .values(
          input.faqs.map((faq, index) => ({
            entryId: id,
            position: index + 1,
            question: faq.question,
            answer: faq.answer,
          })),
        )
        .run();
    }

    if (sections.length > 0) logHistory(tx, id, actorId, `Mengubah: ${sections.join(", ")}`, now);
    if (statusChanged) {
      logHistory(
        tx,
        id,
        actorId,
        `Status: ${STATUS_LABEL[current.status]} ke ${STATUS_LABEL[input.status]}`,
        now,
      );
    }
    if (audienceChanged) {
      logHistory(
        tx,
        id,
        actorId,
        `Audiens: ${AUDIENCE_LABEL[current.audience]} ke ${AUDIENCE_LABEL[input.audience]}`,
        now,
      );
    }
    return { ok: true as const, changed: true, entry: loadEditable(tx, id)! };
  });
}

type Lifecycle = Result<{ entry: EditableEntry; message: string }>;

export function publishEntry(id: number, actorId: number, db: AppDb = getDb()): Lifecycle {
  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (current.archivedAt) return fail("Entri ini diarsipkan. Pulihkan dulu sebelum publish.");
    if (current.isPublished) return fail("Entri ini sudah terbit.");

    // Entri yang tidak akan terlihat pembaca ditolak, dan entri yang akan terlihat harus lengkap.
    const blocker = publishBlocker(current, current.steps.length);
    if (blocker) return fail(blocker);

    const now = new Date();
    tx.update(entries)
      .set({ isPublished: true, publishedAt: now, updatedAt: now })
      .where(eq(entries.id, id))
      .run();
    logHistory(
      tx,
      id,
      actorId,
      `Publish: tampil ke ${AUDIENCE_LABEL[current.audience]} sebagai ${STATUS_LABEL[current.status]}`,
      now,
    );
    const entry = loadEditable(tx, id)!;
    return {
      ok: true as const,
      entry,
      message: publicationSummary({ ...entry, archived: false }),
    };
  });
}

export function unpublishEntry(id: number, actorId: number, db: AppDb = getDb()): Lifecycle {
  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (!current.isPublished) return fail("Entri ini belum terbit.");
    const now = new Date();
    tx.update(entries)
      .set({ isPublished: false, updatedAt: now })
      .where(eq(entries.id, id))
      .run();
    logHistory(tx, id, actorId, "Tarik kembali: tidak lagi tampil ke pembaca", now);
    return {
      ok: true as const,
      entry: loadEditable(tx, id)!,
      message: "Entri ditarik kembali. Tidak lagi tampil ke pembaca.",
    };
  });
}

export function archiveEntry(id: number, actorId: number, db: AppDb = getDb()): Lifecycle {
  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (current.archivedAt) return fail("Entri ini sudah diarsipkan.");
    const now = new Date();
    // Satu UPDATE: terarsip dan tidak terbit berubah bersamaan (pemicu database menjaganya).
    tx.update(entries)
      .set({ archivedAt: now, isPublished: false, updatedAt: now })
      .where(eq(entries.id, id))
      .run();
    logHistory(
      tx,
      id,
      actorId,
      current.isPublished
        ? "Diarsipkan (sebelumnya terbit; otomatis ditarik dari pembaca)"
        : "Diarsipkan",
      now,
    );
    return {
      ok: true as const,
      entry: loadEditable(tx, id)!,
      message: "Entri diarsipkan.",
    };
  });
}

export function restoreEntry(id: number, actorId: number, db: AppDb = getDb()): Lifecycle {
  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (!current.archivedAt) return fail("Entri ini tidak sedang diarsipkan.");
    const now = new Date();
    tx.update(entries)
      .set({ archivedAt: null, updatedAt: now })
      .where(eq(entries.id, id))
      .run();
    logHistory(tx, id, actorId, "Dipulihkan dari arsip (kembali ke Inbox sebagai draf)", now);
    return {
      ok: true as const,
      entry: loadEditable(tx, id)!,
      message: "Entri dipulihkan ke Inbox sebagai draf.",
    };
  });
}

// ---------- Daftar ----------

export type AdminListFilters = {
  status?: Status;
  audience?: Audience;
  kind?: Kind;
  published?: "ya" | "tidak";
  q?: string;
};

export type AdminListRow = {
  id: number;
  slug: string;
  title: string;
  kind: Kind;
  nature: Nature;
  status: Status;
  audience: Audience;
  isPublished: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
};

const listColumns = {
  id: entries.id,
  slug: entries.slug,
  title: entries.title,
  kind: entries.kind,
  nature: entries.nature,
  status: entries.status,
  audience: entries.audience,
  isPublished: entries.isPublished,
  archivedAt: entries.archivedAt,
  updatedAt: entries.updatedAt,
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Mengubah query string menjadi filter yang valid; nilai asing diabaikan. */
export function parseAdminFilters(query: Query): AdminListFilters {
  const status = first(query.status);
  const audience = first(query.audiens);
  const kind = first(query.jenis);
  const published = first(query.terbit);
  const q = first(query.q)?.trim().slice(0, LIMITS.title);
  return {
    status: STATUSES.includes(status as Status) ? (status as Status) : undefined,
    audience: AUDIENCES.includes(audience as Audience) ? (audience as Audience) : undefined,
    kind: KINDS.includes(kind as Kind) ? (kind as Kind) : undefined,
    published: published === "ya" || published === "tidak" ? published : undefined,
    q: q || undefined,
  };
}

export function listEntriesAdmin(
  filters: AdminListFilters = {},
  db: AppDb = getDb(),
): AdminListRow[] {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(entries.status, filters.status));
  if (filters.audience) conditions.push(eq(entries.audience, filters.audience));
  if (filters.kind) conditions.push(eq(entries.kind, filters.kind));
  if (filters.published) conditions.push(eq(entries.isPublished, filters.published === "ya"));
  if (filters.q) {
    conditions.push(sql`${entries.title} like ${`%${escapeLike(filters.q)}%`} escape '\\'`);
  }
  return db
    .select(listColumns)
    .from(entries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(entries.updatedAt), desc(entries.id))
    .all();
}

export type InboxRow = AdminListRow & {
  stepCount: number;
  /** Apakah entri ini akan terlihat pembaca bila diterbitkan (status dan audiens bukan Internal). */
  willBeVisible: boolean;
  /** Bagian yang masih kurang; hanya berarti bila willBeVisible. */
  missing: string[];
  /** Tombol Publish hanya untuk entri yang akan terlihat pembaca DAN lengkap. */
  canPublishNow: boolean;
};

/**
 * Entri yang belum terlihat oleh pembaca dan belum diarsipkan, terbaru di atas. "Terlihat oleh
 * pembaca" ditentukan oleh lib/access.ts (bukan sekadar is_published): entri Internal yang
 * (secara keliru) berstatus terbit tetap masuk Inbox karena pembaca tidak bisa melihatnya.
 */
export function listInbox(db: AppDb = getDb()): InboxRow[] {
  const rows = db
    .select({
      ...listColumns,
      summary: entries.summary,
      canPromise: entries.canPromise,
      cannotPromise: entries.cannotPromise,
      stepCount: sql<number>`(select count(*) from ${entrySteps} where ${entrySteps.entryId} = ${entries.id})`,
    })
    .from(entries)
    .where(isNull(entries.archivedAt))
    .orderBy(desc(entries.updatedAt), desc(entries.id))
    .all();
  return rows
    .filter((row) => !isVisibleToReaders(row))
    .map(({ summary, canPromise, cannotPromise, stepCount, ...row }) => {
      const willBeVisible = readersWhoCanView(row).length > 0;
      const missing = missingForPublish(
        { summary, canPromise, cannotPromise, status: row.status, audience: row.audience },
        stepCount,
      );
      return {
        ...row,
        stepCount,
        willBeVisible,
        missing,
        canPublishNow: !row.isPublished && willBeVisible && missing.length === 0,
      };
    });
}

export function listArchive(db: AppDb = getDb()): AdminListRow[] {
  return db
    .select(listColumns)
    .from(entries)
    .where(isNotNull(entries.archivedAt))
    .orderBy(desc(entries.archivedAt), desc(entries.id))
    .all();
}

// ---------- Riwayat ----------

export type HistoryRow = {
  id: number;
  at: Date;
  summary: string;
  userName: string;
  entryId: number;
  entryTitle: string;
};

const historyColumns = {
  id: entryHistory.id,
  at: entryHistory.at,
  summary: entryHistory.summary,
  userName: users.name,
  entryId: entries.id,
  entryTitle: entries.title,
};

export function listHistory(
  options: { entryId?: number; page?: number } = {},
  db: AppDb = getDb(),
): { rows: HistoryRow[]; total: number; page: number; pages: number } {
  const where = options.entryId ? eq(entryHistory.entryId, options.entryId) : undefined;
  const total =
    db
      .select({ n: sql<number>`count(*)` })
      .from(entryHistory)
      .where(where)
      .get()?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMITS.historyPageSize));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1) || 1), pages);
  const rows = db
    .select(historyColumns)
    .from(entryHistory)
    .innerJoin(users, eq(users.id, entryHistory.userId))
    .innerJoin(entries, eq(entries.id, entryHistory.entryId))
    .where(where)
    .orderBy(desc(entryHistory.at), desc(entryHistory.id))
    .limit(LIMITS.historyPageSize)
    .offset((page - 1) * LIMITS.historyPageSize)
    .all();
  return { rows, total, page, pages };
}

export function listEntryHistory(
  entryId: number,
  limit = 30,
  db: AppDb = getDb(),
): HistoryRow[] {
  return db
    .select(historyColumns)
    .from(entryHistory)
    .innerJoin(users, eq(users.id, entryHistory.userId))
    .innerJoin(entries, eq(entries.id, entryHistory.entryId))
    .where(eq(entryHistory.entryId, entryId))
    .orderBy(desc(entryHistory.at), desc(entryHistory.id))
    .limit(limit)
    .all();
}
