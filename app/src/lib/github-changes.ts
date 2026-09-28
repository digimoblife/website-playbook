// Perubahan dari webhook GitHub (Langkah 6c) yang menunggu keputusan Admin, beserta triasenya
// (Langkah 6d, aturan di lib/triage.ts).
//
// Fungsi di sini TIDAK memeriksa siapa pemanggilnya; pemeriksaan Admin ada di Server Action
// (app/admin/github/actions.ts). Tidak ada yang terbit otomatis: entri yang dibuat dari sini selalu
// Internal, beraudiens Internal, dan belum terbit (createEntry / pullFromGithub).
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { aiProposals, entries, githubChanges } from "@/db/schema";
import { createEntry, logHistory, pullFromGithub, type DbLike, type Result } from "@/lib/admin-entries";
import type { AiDraftFields } from "@/lib/ai-draft";
import { LIMITS, TRIAGE_BUCKETS, type GithubChangeKind, type Kind, type TriageBucket } from "@/lib/domain";
import { KIND_LABEL } from "@/lib/labels";
import { isValidSlug } from "@/lib/slug";
import { commitType, fiturSlugs, guessKind, type KindGuess } from "@/lib/triage";

const fail = (error: string) => ({ ok: false as const, error });

/** Draf atau perubahan yang menunggu lebih lama dari ini diberi pengingat di Inbox. */
export const WAITING_REMINDER_DAYS = 7;

export type MatchedEntry = { id: number; slug: string; title: string; kind: Kind };

export type GithubChangeRow = {
  id: number;
  repo: string;
  kind: GithubChangeKind;
  prNumber: number | null;
  commitSha: string | null;
  title: string;
  url: string;
  files: string[];
  happenedAt: Date | null;
  receivedAt: Date;
  bucket: TriageBucket;
  /** Tipe Conventional Commits dari judul, atau null. */
  commitType: string | null;
  /** Slug dari trailer "Fitur:" di pesan commit atau deskripsi PR. */
  fiturSlugs: string[];
  /** Entri yang cocok dengan trailer "Fitur:" pertama yang ada di peta fitur. */
  matchedEntry: MatchedEntry | null;
  /** Jenis: dari entri yang cocok bila ada, bila tidak tebakan (lib/triage.ts). */
  kindGuess: KindGuess;
};

function parseFiles(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

type RawChange = typeof githubChanges.$inferSelect;

/** Menambahkan hasil triase ke baris mentah, memakai entri yang ada di database SAAT INI. */
function enrich(rows: RawChange[], db: DbLike): GithubChangeRow[] {
  const slugsByRow = rows.map((row) => fiturSlugs(`${row.title}\n${row.body}`));
  const allSlugs = [...new Set(slugsByRow.flat())];
  const bySlug = new Map<string, MatchedEntry>(
    (allSlugs.length > 0
      ? db
          .select({ id: entries.id, slug: entries.slug, title: entries.title, kind: entries.kind })
          .from(entries)
          .where(inArray(entries.slug, allSlugs))
          .all()
      : []
    ).map((e) => [e.slug, e]),
  );
  const addonNames = db
    .select({ slug: entries.slug, title: entries.title })
    .from(entries)
    .where(eq(entries.kind, "addon"))
    .all()
    .flatMap((e) => [e.title, e.slug]);

  return rows.map((row, index) => {
    const files = parseFiles(row.files);
    const slugs = slugsByRow[index];
    const matchedEntry = slugs.map((s) => bySlug.get(s)).find((e): e is MatchedEntry => !!e) ?? null;
    const guess = guessKind({ title: row.title, files }, addonNames);
    return {
      id: row.id,
      repo: row.repo,
      kind: row.kind,
      prNumber: row.prNumber,
      commitSha: row.commitSha,
      title: row.title,
      url: row.url,
      files,
      happenedAt: row.happenedAt,
      receivedAt: row.receivedAt,
      bucket: row.bucket,
      commitType: commitType(row.title),
      fiturSlugs: slugs,
      matchedEntry,
      kindGuess: matchedEntry
        ? { kind: matchedEntry.kind, reason: `dari entri "${matchedEntry.title}"`, area: guess.area }
        : guess,
    };
  });
}

/** Perubahan yang belum ditinjau di satu kelompok triase, terbaru di atas. */
export function listNewGithubChanges(bucket: TriageBucket = "kandidat", db: AppDb = getDb()): GithubChangeRow[] {
  const rows = db
    .select()
    .from(githubChanges)
    .where(and(eq(githubChanges.state, "baru"), eq(githubChanges.bucket, bucket)))
    .orderBy(desc(githubChanges.happenedAt), desc(githubChanges.id))
    .all();
  return enrich(rows, db);
}

export function countNewGithubChanges(db: AppDb = getDb()): Record<TriageBucket, number> {
  const rows = db
    .select({ bucket: githubChanges.bucket })
    .from(githubChanges)
    .where(eq(githubChanges.state, "baru"))
    .all();
  return Object.fromEntries(
    TRIAGE_BUCKETS.map((bucket) => [bucket, rows.filter((r) => r.bucket === bucket).length]),
  ) as Record<TriageBucket, number>;
}

export type ChangeGroup = {
  key: string;
  type: "pembaruan" | "fitur-baru" | "tanpa-kunci";
  label: string;
  entry: MatchedEntry | null;
  changes: GithubChangeRow[];
};

/**
 * Mengelompokkan kandidat per fitur: "Pembaruan" untuk entri yang sudah ada, "Kandidat fitur baru"
 * untuk trailer yang belum punya entri, dan satu kelompok untuk perubahan tanpa trailer.
 */
export function groupChanges(rows: GithubChangeRow[]): ChangeGroup[] {
  const groups = new Map<string, ChangeGroup>();
  for (const row of rows) {
    let group: Omit<ChangeGroup, "changes">;
    if (row.matchedEntry) {
      group = {
        key: `entri:${row.matchedEntry.id}`,
        type: "pembaruan",
        label: `Pembaruan: ${row.matchedEntry.title} (${KIND_LABEL[row.matchedEntry.kind]})`,
        entry: row.matchedEntry,
      };
    } else if (row.fiturSlugs.length > 0) {
      group = { key: `baru:${row.fiturSlugs[0]}`, type: "fitur-baru", label: `Kandidat fitur baru: ${row.fiturSlugs[0]}`, entry: null };
    } else {
      group = { key: "tanpa-kunci", type: "tanpa-kunci", label: "Belum berkunci Fitur", entry: null };
    }
    const existing = groups.get(group.key) ?? { ...group, changes: [] };
    existing.changes.push(row);
    groups.set(group.key, existing);
  }
  const order = { pembaruan: 0, "fitur-baru": 1, "tanpa-kunci": 2 } as const;
  return [...groups.values()].sort((a, b) => order[a.type] - order[b.type]);
}

export function getGithubChange(id: number, db: AppDb = getDb()) {
  return db.select().from(githubChanges).where(eq(githubChanges.id, id)).get() ?? null;
}

export function getEnrichedGithubChange(id: number, db: AppDb = getDb()): GithubChangeRow | null {
  const row = getGithubChange(id, db);
  return row ? enrich([row], db)[0] : null;
}

export function markGithubChangeReviewed(
  id: number,
  actorId: number,
  db: AppDb = getDb(),
  entryId: number | null = null,
): Result {
  const row = getGithubChange(id, db);
  if (!row) return fail("Perubahan tidak ditemukan.");
  if (row.state === "ditinjau") return fail("Perubahan ini sudah ditinjau.");
  // Pembaruan fitur yang sudah ada ditautkan ke entrinya, supaya jejaknya tidak hilang.
  const linked = entryId ?? getEnrichedGithubChange(id, db)?.matchedEntry?.id ?? null;
  db.update(githubChanges)
    .set({ state: "ditinjau", reviewedAt: new Date(), reviewedBy: actorId, ...(linked ? { entryId: linked } : {}) })
    .where(and(eq(githubChanges.id, id), eq(githubChanges.state, "baru")))
    .run();
  return { ok: true };
}

/** Admin memindahkan perubahan ke kelompok lain (mis. mengembalikan dari Arsip menjadi kandidat). */
export function setGithubChangeBucket(id: number, bucket: unknown, db: AppDb = getDb()): Result {
  if (!TRIAGE_BUCKETS.includes(bucket as TriageBucket)) return fail("Kelompok tidak valid.");
  const row = getGithubChange(id, db);
  if (!row) return fail("Perubahan tidak ditemukan.");
  if (row.state === "ditinjau") return fail("Perubahan ini sudah ditinjau.");
  db.update(githubChanges).set({ bucket: bucket as TriageBucket }).where(eq(githubChanges.id, id)).run();
  return { ok: true };
}

/**
 * Menerapkan hasil triase ke entri yang BARU dibuat dari sebuah perubahan:
 *  - slug entri memakai trailer "Fitur:" bila belum dipakai, supaya commit berikutnya dengan kunci
 *    yang sama langsung dikenali sebagai Pembaruan entri ini;
 *  - Jenis memakai tebakan aturan (audit/validasi-jenis.md), dicatat di riwayat sebagai tebakan.
 * Status, audiens, dan terbit tidak disentuh (tetap Internal dan belum terbit).
 */
export function applyTriageToNewEntry(entryId: number, change: GithubChangeRow, actorId: number, db: AppDb = getDb()): void {
  const set: { slug?: string; kind?: Kind } = { kind: change.kindGuess.kind };
  const slug = change.fiturSlugs[0];
  if (slug && isValidSlug(slug)) {
    const taken = db.select({ id: entries.id }).from(entries).where(eq(entries.slug, slug)).get();
    if (!taken) set.slug = slug;
  }
  db.update(entries).set(set).where(eq(entries.id, entryId)).run();
  const notes = [`Jenis ditebak ${KIND_LABEL[change.kindGuess.kind]} (${change.kindGuess.reason}); periksa di editor`];
  if (set.slug) notes.push(`slug memakai kunci Fitur: ${set.slug}`);
  logHistory(db, entryId, actorId, notes.join("; "));
}

/**
 * Membuat entri draf dari commit langsung, tanpa AI: judulnya diambil dari pesan commit. Isinya
 * dilengkapi Admin di editor. Commit ditandai sudah ditinjau dan ditautkan ke entri itu.
 */
export function createEntryFromCommit(
  id: number,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ entryId: number }> {
  const change = getEnrichedGithubChange(id, db);
  if (!change) return fail("Perubahan tidak ditemukan.");
  if (change.kind !== "commit") return fail("Hanya untuk commit langsung. Untuk PR, pakai Buat draf AI.");
  const row = getGithubChange(id, db)!;
  if (row.state === "ditinjau") return fail("Perubahan ini sudah ditinjau.");
  const created = createEntry({ title: change.title.slice(0, LIMITS.title), actorId }, db);
  if (!created.ok) return created;
  logHistory(db, created.id, actorId, `Dibuat dari commit ${change.commitSha?.slice(0, 7)} di ${change.repo}`);
  applyTriageToNewEntry(created.id, change, actorId, db);
  markGithubChangeReviewed(id, actorId, db, created.id);
  return { ok: true, entryId: created.id };
}

/**
 * Draf yang pantas diingatkan: berasal dari GitHub, atau sudah diatur tampil ke pembaca tetapi belum
 * dipublish. Draf peta fitur yang masih Internal dan belum disentuh sengaja tidak diingatkan, supaya
 * pengingat tidak selalu menyala (dan akhirnya diabaikan).
 */
export function needsDraftReminder(row: { fromGithub: boolean; willBeVisible: boolean; updatedAt: Date }): boolean {
  return (row.fromGithub || row.willBeVisible) && isWaitingTooLong(row.updatedAt);
}

/** Apakah sebuah tanggal sudah lewat dari batas pengingat (dipakai Inbox). */
export function isWaitingTooLong(date: Date | null, now: number = Date.now()): boolean {
  return date !== null && now - date.getTime() > WAITING_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

// ---------- Usulan AI untuk satu PR (Langkah 6d) ----------

export type ProposalRow = typeof aiProposals.$inferSelect;

/**
 * Menyimpan usulan AI untuk sebuah PR. Usulan lama yang BELUM dijadikan entri diganti; yang sudah
 * menjadi entri dipertahankan. Nama file PR (bukan isinya) ikut dicatat di perubahan.
 */
export function saveProposals(
  changeId: number,
  proposals: AiDraftFields[],
  files: string[],
  db: AppDb = getDb(),
): void {
  db.transaction((tx) => {
    tx.delete(aiProposals).where(and(eq(aiProposals.changeId, changeId), isNull(aiProposals.entryId))).run();
    const kept = tx.select({ id: aiProposals.id }).from(aiProposals).where(eq(aiProposals.changeId, changeId)).all().length;
    tx.insert(aiProposals)
      .values(proposals.map((p, index) => ({ changeId, position: kept + index + 1, ...p })))
      .run();
    tx.update(githubChanges).set({ files: JSON.stringify(files.slice(0, 300)) }).where(eq(githubChanges.id, changeId)).run();
  });
}

export function listProposals(changeId: number, db: AppDb = getDb()): ProposalRow[] {
  return db
    .select()
    .from(aiProposals)
    .where(eq(aiProposals.changeId, changeId))
    .orderBy(asc(aiProposals.position), asc(aiProposals.id))
    .all();
}

/**
 * Admin memilih satu usulan untuk dijadikan entri. Entri selalu Internal, beraudiens Internal, dan
 * belum terbit (pullFromGithub). Jenis dan Sifat usulan AI dicatat sebagai usulan di riwayat.
 */
export function createEntryFromProposal(
  proposalId: number,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ entryId: number; changeId: number }> {
  const proposal = db.select().from(aiProposals).where(eq(aiProposals.id, proposalId)).get();
  if (!proposal) return fail("Usulan tidak ditemukan.");
  if (proposal.entryId) return fail("Usulan ini sudah dijadikan entri.");
  const change = getGithubChange(proposal.changeId, db);
  if (!change || change.kind !== "pr" || change.prNumber === null) return fail("PR asal tidak ditemukan.");

  const created = pullFromGithub(
    { number: change.prNumber, title: change.title, url: change.url, repo: change.repo },
    proposal,
    actorId,
    db,
  );
  if (!created.ok) return created;
  db.update(aiProposals).set({ entryId: created.id }).where(eq(aiProposals.id, proposalId)).run();
  const total = listProposals(proposal.changeId, db).length;
  logHistory(
    db,
    created.id,
    actorId,
    `Dari usulan AI ${proposal.position} dari ${total} untuk PR #${change.prNumber}; Jenis ${KIND_LABEL[proposal.kind]} diusulkan AI, periksa di editor`,
  );
  return { ok: true, entryId: created.id, changeId: proposal.changeId };
}

/** Selesai memilih usulan: PR ditandai ditinjau dan ditautkan ke entri pertama yang dibuat. */
export function finishProposals(changeId: number, actorId: number, db: AppDb = getDb()): Result {
  const firstEntry = listProposals(changeId, db).find((p) => p.entryId)?.entryId ?? null;
  return markGithubChangeReviewed(changeId, actorId, db, firstEntry);
}
