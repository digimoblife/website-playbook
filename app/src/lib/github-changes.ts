// Perubahan dari webhook GitHub (Langkah 6c) yang menunggu keputusan Admin di Inbox.
// Fungsi di sini TIDAK memeriksa siapa pemanggilnya; pemeriksaan Admin ada di Server Action
// (app/admin/github-masuk/actions.ts). Tidak ada yang terbit otomatis: entri yang dibuat dari
// sini selalu Internal, beraudiens Internal, dan belum terbit (createEntry / pullFromGithub).
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { githubChanges } from "@/db/schema";
import { createEntry, logHistory, type Result } from "@/lib/admin-entries";
import { LIMITS, type GithubChangeKind } from "@/lib/domain";

const fail = (error: string) => ({ ok: false as const, error });

export type GithubChangeRow = {
  id: number;
  repo: string;
  kind: GithubChangeKind;
  prNumber: number | null;
  commitSha: string | null;
  title: string;
  body: string;
  url: string;
  files: string[];
  happenedAt: Date | null;
  receivedAt: Date;
};

function parseFiles(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
}

/** Perubahan yang belum ditinjau, terbaru di atas. */
export function listNewGithubChanges(db: AppDb = getDb()): GithubChangeRow[] {
  return db
    .select()
    .from(githubChanges)
    .where(eq(githubChanges.state, "baru"))
    .orderBy(desc(githubChanges.happenedAt), desc(githubChanges.id))
    .all()
    .map((row) => ({
      id: row.id,
      repo: row.repo,
      kind: row.kind,
      prNumber: row.prNumber,
      commitSha: row.commitSha,
      title: row.title,
      body: row.body,
      url: row.url,
      files: parseFiles(row.files),
      happenedAt: row.happenedAt,
      receivedAt: row.receivedAt,
    }));
}

export function getGithubChange(id: number, db: AppDb = getDb()) {
  return db.select().from(githubChanges).where(eq(githubChanges.id, id)).get() ?? null;
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
  db.update(githubChanges)
    .set({ state: "ditinjau", reviewedAt: new Date(), reviewedBy: actorId, ...(entryId ? { entryId } : {}) })
    .where(and(eq(githubChanges.id, id), eq(githubChanges.state, "baru")))
    .run();
  return { ok: true };
}

/**
 * Membuat entri draf dari commit langsung ("perlu ditinjau"), tanpa AI: judulnya diambil dari
 * pesan commit. Isinya dilengkapi Admin di editor. Commit ditandai sudah ditinjau.
 */
export function createEntryFromCommit(
  id: number,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ entryId: number }> {
  const row = getGithubChange(id, db);
  if (!row) return fail("Perubahan tidak ditemukan.");
  if (row.kind !== "commit") return fail("Hanya untuk commit langsung. Untuk PR, pakai Buat draf AI.");
  if (row.state === "ditinjau") return fail("Perubahan ini sudah ditinjau.");
  const created = createEntry({ title: row.title.slice(0, LIMITS.title), actorId }, db);
  if (!created.ok) return created;
  logHistory(db, created.id, actorId, `Dibuat dari commit ${row.commitSha?.slice(0, 7)} di ${row.repo}`);
  markGithubChangeReviewed(id, actorId, db, created.id);
  return { ok: true, entryId: created.id };
}

export function countNewGithubChanges(db: AppDb = getDb()): { pr: number; commit: number } {
  const rows = db
    .select({ kind: githubChanges.kind })
    .from(githubChanges)
    .where(eq(githubChanges.state, "baru"))
    .orderBy(asc(githubChanges.id))
    .all();
  return {
    pr: rows.filter((r) => r.kind === "pr").length,
    commit: rows.filter((r) => r.kind === "commit").length,
  };
}
