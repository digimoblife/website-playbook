// Panduan skenario (Langkah 5): alur langkah demi langkah yang merangkai beberapa halaman fitur,
// mis. "Menunjukkan Lapaq ke calon pelanggan dalam 10 menit".
//
// Aturan terlihatnya SAMA dengan entri dan diputuskan oleh lib/access.ts (canView). Modul ini
// tidak punya aturan akses sendiri. Satu hal khusus: langkah panduan boleh menautkan halaman
// fitur, dan tautan (termasuk judul fiturnya) HANYA ditampilkan bila pembaca boleh melihat
// entri itu. Bila tidak, pembaca hanya melihat teks langkahnya, tanpa jejak entri yang dirujuk.
//
// Seperti lib/admin-entries.ts, fungsi tulis di sini TIDAK memeriksa siapa pemanggilnya;
// pemeriksaan Admin ada di setiap Server Action (app/admin/panduan/actions.ts).
import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries, guideHistory, guides, guideSteps, users } from "@/db/schema";
import { canView, visibleAudiences, type Viewer } from "@/lib/access";
import { clean, oneLine, type DbLike, type Fail, type Result } from "@/lib/admin-entries";
import { AUDIENCES, LIMITS, STATUSES, type Audience, type Status } from "@/lib/domain";
import { AUDIENCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { guidePublishBlocker, type LinkableEntry } from "@/lib/guide-rules";
import { publicationSummary } from "@/lib/publish";
import { isValidSlug, slugify } from "@/lib/slug";

const fail = (error: string): Fail => ({ ok: false, error });

import type { GuideInput, GuideStepInput } from "@/lib/guide-rules";

export { guideLinkWarnings, guidePublishBlocker, missingForGuidePublish } from "@/lib/guide-rules";
export type { GuideInput, GuideStepInput, LinkableEntry } from "@/lib/guide-rules";

export type EditableGuide = GuideInput & {
  id: number;
  isPublished: boolean;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ---------- Validasi input ----------

export function parseGuideInput(raw: unknown): Result<{ input: GuideInput }> {
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
  if (summary.length > LIMITS.summary) return fail(`Ringkasan maksimal ${LIMITS.summary} karakter.`);

  const intro = clean(r.intro);
  if (intro === null) return fail("Kapan dipakai tidak valid.");
  if (intro.length > LIMITS.longText) return fail(`Kapan dipakai maksimal ${LIMITS.longText} karakter.`);

  if (!STATUSES.includes(r.status as Status)) return fail("Status tidak valid.");
  if (!AUDIENCES.includes(r.audience as Audience)) return fail("Audiens tidak valid.");

  if (!Array.isArray(r.steps)) return fail("Langkah tidak valid.");
  if (r.steps.length > LIMITS.guideSteps) return fail(`Maksimal ${LIMITS.guideSteps} langkah per panduan.`);
  const steps: GuideStepInput[] = [];
  for (const [index, item] of r.steps.entries()) {
    if (typeof item !== "object" || item === null) return fail(`Langkah ${index + 1} tidak valid.`);
    const step = item as Record<string, unknown>;
    const text = oneLine(step.text);
    if (!text) return fail(`Langkah ${index + 1} masih kosong. Isi atau hapus langkah itu.`);
    if (text.length > LIMITS.stepText) {
      return fail(`Langkah ${index + 1} maksimal ${LIMITS.stepText} karakter.`);
    }
    const entryId = step.entryId ?? null;
    if (entryId !== null && !(Number.isInteger(entryId) && (entryId as number) > 0)) {
      return fail(`Fitur untuk langkah ${index + 1} tidak valid.`);
    }
    steps.push({ text, entryId: entryId as number | null });
  }

  return {
    ok: true,
    input: {
      title,
      slug,
      summary,
      intro,
      status: r.status as Status,
      audience: r.audience as Audience,
      steps,
    },
  };
}

// ---------- Membaca (Admin) ----------

export function loadEditableGuide(db: DbLike, id: number): EditableGuide | null {
  const row = db.select().from(guides).where(eq(guides.id, id)).get();
  if (!row) return null;
  const steps = db
    .select({ text: guideSteps.text, entryId: guideSteps.entryId })
    .from(guideSteps)
    .where(eq(guideSteps.guideId, id))
    .orderBy(asc(guideSteps.position))
    .all();
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    intro: row.intro,
    status: row.status,
    audience: row.audience,
    steps,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getEditableGuide(id: number, db: AppDb = getDb()): EditableGuide | null {
  return loadEditableGuide(db, id);
}

/** Entri yang bisa ditautkan dari langkah panduan (semua yang tidak diarsipkan), urut judul. */
export function listLinkableEntries(db: AppDb = getDb()): LinkableEntry[] {
  return db
    .select({
      id: entries.id,
      title: entries.title,
      isPublished: entries.isPublished,
      status: entries.status,
      audience: entries.audience,
      archivedAt: entries.archivedAt,
    })
    .from(entries)
    .where(isNull(entries.archivedAt))
    .orderBy(asc(entries.title), asc(entries.id))
    .all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      readers: (["marketing", "partner"] as const).filter((role) => canView({ role }, row)),
    }));
}

// ---------- Menulis ----------

export function logGuideHistory(
  db: DbLike,
  guideId: number,
  userId: number,
  summary: string,
  at: Date = new Date(),
): void {
  db.insert(guideHistory).values({ guideId, userId, summary, at }).run();
}

function uniqueGuideSlug(db: DbLike, base: string): string {
  let candidate = base;
  for (let n = 2; ; n++) {
    const clash = db.select({ id: guides.id }).from(guides).where(eq(guides.slug, candidate)).get();
    if (!clash) return candidate;
    const suffix = `-${n}`;
    candidate = base.slice(0, LIMITS.slug - suffix.length).replace(/-+$/, "") + suffix;
  }
}

export function createGuide(
  input: { title: unknown; actorId: number },
  db: AppDb = getDb(),
): Result<{ id: number; slug: string }> {
  const title = oneLine(input.title);
  if (!title) return fail("Judul wajib diisi.");
  if (title.length > LIMITS.title) return fail(`Judul maksimal ${LIMITS.title} karakter.`);

  return db.transaction((tx) => {
    const slug = uniqueGuideSlug(tx, slugify(title));
    const now = new Date();
    // Default aman dari skema: Internal, beraudiens Internal, belum terbit.
    const row = tx
      .insert(guides)
      .values({ slug, title, createdAt: now, updatedAt: now })
      .returning({ id: guides.id })
      .get();
    logGuideHistory(tx, row.id, input.actorId, "Membuat panduan", now);
    return { ok: true as const, id: row.id, slug };
  });
}

const GUIDE_SECTION_LABELS: [keyof GuideInput, string][] = [
  ["title", "Judul"],
  ["slug", "Slug"],
  ["summary", "Ringkasan"],
  ["intro", "Kapan dipakai"],
];

export function saveGuide(
  id: number,
  raw: unknown,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ changed: boolean; guide: EditableGuide }> {
  const parsed = parseGuideInput(raw);
  if (!parsed.ok) return parsed;
  const input = parsed.input;

  return db.transaction((tx) => {
    const current = loadEditableGuide(tx, id);
    if (!current) return fail("Panduan tidak ditemukan.");
    if (current.archivedAt) return fail("Panduan ini diarsipkan. Pulihkan dulu sebelum menyunting.");

    const clash = tx
      .select({ id: guides.id })
      .from(guides)
      .where(and(eq(guides.slug, input.slug), ne(guides.id, id)))
      .get();
    if (clash) return fail("Slug ini sudah dipakai panduan lain. Pilih slug yang berbeda.");

    const entryIds = [...new Set(input.steps.flatMap((s) => (s.entryId ? [s.entryId] : [])))];
    if (entryIds.length > 0) {
      const found = tx
        .select({ id: entries.id })
        .from(entries)
        .where(and(inArray(entries.id, entryIds), isNull(entries.archivedAt)))
        .all();
      if (found.length !== entryIds.length) {
        return fail("Fitur yang dipilih untuk langkah tidak ditemukan atau sudah diarsipkan.");
      }
    }

    const sections: string[] = [];
    for (const [key, label] of GUIDE_SECTION_LABELS) {
      if (current[key] !== input[key]) sections.push(label);
    }
    if (JSON.stringify(current.steps) !== JSON.stringify(input.steps)) sections.push("Langkah");
    const statusChanged = current.status !== input.status;
    const audienceChanged = current.audience !== input.audience;

    if (sections.length === 0 && !statusChanged && !audienceChanged) {
      return { ok: true as const, changed: false, guide: current };
    }

    const now = new Date();
    tx.update(guides)
      .set({
        title: input.title,
        slug: input.slug,
        summary: input.summary,
        intro: input.intro,
        status: input.status,
        audience: input.audience,
        updatedAt: now,
      })
      .where(eq(guides.id, id))
      .run();

    tx.delete(guideSteps).where(eq(guideSteps.guideId, id)).run();
    if (input.steps.length > 0) {
      tx.insert(guideSteps)
        .values(
          input.steps.map((step, index) => ({
            guideId: id,
            position: index + 1,
            text: step.text,
            entryId: step.entryId,
          })),
        )
        .run();
    }

    if (sections.length > 0) logGuideHistory(tx, id, actorId, `Mengubah: ${sections.join(", ")}`, now);
    if (statusChanged) {
      logGuideHistory(
        tx,
        id,
        actorId,
        `Status: ${STATUS_LABEL[current.status]} ke ${STATUS_LABEL[input.status]}`,
        now,
      );
    }
    if (audienceChanged) {
      logGuideHistory(
        tx,
        id,
        actorId,
        `Audiens: ${AUDIENCE_LABEL[current.audience]} ke ${AUDIENCE_LABEL[input.audience]}`,
        now,
      );
    }
    return { ok: true as const, changed: true, guide: loadEditableGuide(tx, id)! };
  });
}

type GuideLifecycle = Result<{ guide: EditableGuide; message: string }>;

export function publishGuide(id: number, actorId: number, db: AppDb = getDb()): GuideLifecycle {
  return db.transaction((tx) => {
    const current = loadEditableGuide(tx, id);
    if (!current) return fail("Panduan tidak ditemukan.");
    if (current.archivedAt) return fail("Panduan ini diarsipkan. Pulihkan dulu sebelum publish.");
    if (current.isPublished) return fail("Panduan ini sudah terbit.");
    const blocker = guidePublishBlocker(current, current.steps.length);
    if (blocker) return fail(blocker);

    const now = new Date();
    tx.update(guides)
      .set({ isPublished: true, publishedAt: now, updatedAt: now })
      .where(eq(guides.id, id))
      .run();
    logGuideHistory(
      tx,
      id,
      actorId,
      `Publish: tampil ke ${AUDIENCE_LABEL[current.audience]} sebagai ${STATUS_LABEL[current.status]}`,
      now,
    );
    const guide = loadEditableGuide(tx, id)!;
    return { ok: true as const, guide, message: publicationSummary({ ...guide, archived: false }) };
  });
}

export function unpublishGuide(id: number, actorId: number, db: AppDb = getDb()): GuideLifecycle {
  return db.transaction((tx) => {
    const current = loadEditableGuide(tx, id);
    if (!current) return fail("Panduan tidak ditemukan.");
    if (!current.isPublished) return fail("Panduan ini belum terbit.");
    const now = new Date();
    tx.update(guides).set({ isPublished: false, updatedAt: now }).where(eq(guides.id, id)).run();
    logGuideHistory(tx, id, actorId, "Tarik kembali: tidak lagi tampil ke pembaca", now);
    return {
      ok: true as const,
      guide: loadEditableGuide(tx, id)!,
      message: "Panduan ditarik kembali. Tidak lagi tampil ke pembaca.",
    };
  });
}

export function archiveGuide(id: number, actorId: number, db: AppDb = getDb()): GuideLifecycle {
  return db.transaction((tx) => {
    const current = loadEditableGuide(tx, id);
    if (!current) return fail("Panduan tidak ditemukan.");
    if (current.archivedAt) return fail("Panduan ini sudah diarsipkan.");
    const now = new Date();
    tx.update(guides)
      .set({ archivedAt: now, isPublished: false, updatedAt: now })
      .where(eq(guides.id, id))
      .run();
    logGuideHistory(
      tx,
      id,
      actorId,
      current.isPublished ? "Diarsipkan (sebelumnya terbit; otomatis ditarik dari pembaca)" : "Diarsipkan",
      now,
    );
    return { ok: true as const, guide: loadEditableGuide(tx, id)!, message: "Panduan diarsipkan." };
  });
}

export function restoreGuide(id: number, actorId: number, db: AppDb = getDb()): GuideLifecycle {
  return db.transaction((tx) => {
    const current = loadEditableGuide(tx, id);
    if (!current) return fail("Panduan tidak ditemukan.");
    if (!current.archivedAt) return fail("Panduan ini tidak sedang diarsipkan.");
    const now = new Date();
    tx.update(guides).set({ archivedAt: null, updatedAt: now }).where(eq(guides.id, id)).run();
    logGuideHistory(tx, id, actorId, "Dipulihkan dari arsip (kembali sebagai draf)", now);
    return {
      ok: true as const,
      guide: loadEditableGuide(tx, id)!,
      message: "Panduan dipulihkan sebagai draf.",
    };
  });
}

// ---------- Daftar dan riwayat (Admin) ----------

export type AdminGuideRow = {
  id: number;
  slug: string;
  title: string;
  status: Status;
  audience: Audience;
  isPublished: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
  stepCount: number;
};

export function listGuidesAdmin(db: AppDb = getDb()): AdminGuideRow[] {
  return db
    .select({
      id: guides.id,
      slug: guides.slug,
      title: guides.title,
      status: guides.status,
      audience: guides.audience,
      isPublished: guides.isPublished,
      archivedAt: guides.archivedAt,
      updatedAt: guides.updatedAt,
      stepCount: sql<number>`(select count(*) from ${guideSteps} where ${guideSteps.guideId} = ${guides.id})`,
    })
    .from(guides)
    .orderBy(desc(guides.updatedAt), desc(guides.id))
    .all();
}

export type GuideHistoryRow = { id: number; at: Date; summary: string; userName: string };

export function listGuideHistory(guideId: number, limit = 30, db: AppDb = getDb()): GuideHistoryRow[] {
  return db
    .select({
      id: guideHistory.id,
      at: guideHistory.at,
      summary: guideHistory.summary,
      userName: users.name,
    })
    .from(guideHistory)
    .innerJoin(users, eq(users.id, guideHistory.userId))
    .where(eq(guideHistory.guideId, guideId))
    .orderBy(desc(guideHistory.at), desc(guideHistory.id))
    .limit(limit)
    .all();
}

// ---------- Membaca (pembaca) ----------

const guideReaderColumns = {
  id: guides.id,
  slug: guides.slug,
  title: guides.title,
  summary: guides.summary,
  intro: guides.intro,
  status: guides.status,
  audience: guides.audience,
  isPublished: guides.isPublished,
  publishedAt: guides.publishedAt,
  archivedAt: guides.archivedAt,
  updatedAt: guides.updatedAt,
};

export type GuideForReader = {
  [K in keyof typeof guideReaderColumns]: (typeof guides.$inferSelect)[K];
};

export type GuideStepForReader = {
  text: string;
  /** Ada HANYA bila pembaca boleh melihat halaman fitur yang dirujuk. */
  entry: { slug: string; title: string } | null;
};

export type GuideDetailForReader = GuideForReader & { steps: GuideStepForReader[] };

type ActiveViewer = NonNullable<Viewer>;

function guideVisibilityFilter(viewer: ActiveViewer): SQL | undefined {
  if (viewer.role === "admin") return undefined;
  const audiences = visibleAudiences(viewer.role);
  if (audiences.length === 0) return sql`0`;
  return and(
    eq(guides.isPublished, true),
    isNull(guides.archivedAt),
    ne(guides.status, "internal"),
    inArray(guides.audience, [...audiences]),
  );
}

export function listGuidesFor(viewer: Viewer, db: AppDb = getDb()): GuideForReader[] {
  if (!viewer || viewer.active === false) return [];
  return db
    .select(guideReaderColumns)
    .from(guides)
    .where(guideVisibilityFilter(viewer))
    .orderBy(desc(guides.publishedAt), desc(guides.id))
    .all()
    .filter((row) => canView(viewer, row));
}

/** null bila panduan tidak ada atau tidak boleh dilihat (keduanya tak dibedakan). */
export function getGuideDetailBySlugFor(
  viewer: Viewer,
  slug: string,
  db: AppDb = getDb(),
): GuideDetailForReader | null {
  if (!viewer || viewer.active === false) return null;
  const filter = guideVisibilityFilter(viewer);
  const guide = db
    .select(guideReaderColumns)
    .from(guides)
    .where(filter ? and(eq(guides.slug, slug), filter) : eq(guides.slug, slug))
    .get();
  if (!guide || !canView(viewer, guide)) return null;

  const steps = db
    .select({ text: guideSteps.text, entryId: guideSteps.entryId })
    .from(guideSteps)
    .where(eq(guideSteps.guideId, guide.id))
    .orderBy(asc(guideSteps.position))
    .all();

  // Entri yang dirujuk diambil lewat aturan akses yang sama (SQL + canView). Entri yang tidak
  // boleh dilihat tidak ikut terambil, jadi judul dan slug-nya tidak pernah sampai ke halaman.
  const entryIds = [...new Set(steps.flatMap((s) => (s.entryId ? [s.entryId] : [])))];
  const visibleEntries = new Map<number, { slug: string; title: string }>();
  if (entryIds.length > 0) {
    const entryFilter =
      viewer.role === "admin"
        ? undefined
        : and(
            eq(entries.isPublished, true),
            isNull(entries.archivedAt),
            ne(entries.status, "internal"),
            inArray(entries.audience, [...visibleAudiences(viewer.role)]),
          );
    const rows = db
      .select({
        id: entries.id,
        slug: entries.slug,
        title: entries.title,
        isPublished: entries.isPublished,
        status: entries.status,
        audience: entries.audience,
        archivedAt: entries.archivedAt,
      })
      .from(entries)
      .where(entryFilter ? and(inArray(entries.id, entryIds), entryFilter) : inArray(entries.id, entryIds))
      .all();
    for (const row of rows) {
      if (canView(viewer, row)) visibleEntries.set(row.id, { slug: row.slug, title: row.title });
    }
  }

  return {
    ...guide,
    steps: steps.map((step) => ({
      text: step.text,
      entry: step.entryId !== null ? (visibleEntries.get(step.entryId) ?? null) : null,
    })),
  };
}
