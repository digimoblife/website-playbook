// Penerima webhook GitHub (Langkah 6c). Dipanggil oleh app/api/github/webhook/route.ts.
//
// Keamanan:
//  - Setiap kiriman WAJIB bertanda tangan HMAC-SHA256 (header X-Hub-Signature-256) dengan rahasia
//    GITHUB_WEBHOOK_SECRET dari lingkungan server. Dibandingkan dengan timingSafeEqual. Tanpa
//    rahasia, semua kiriman ditolak.
//  - Hanya repo yang sedang dipakai (Pengaturan, lib/settings.ts) yang diproses; repo lain diabaikan.
//  - Tidak ada yang terbit otomatis. Kiriman hanya dicatat sebagai perubahan berstatus "baru"
//    yang ditinjau Admin di Inbox.
//  - Isi PR dan pesan commit hanya dilihat Admin dan TIDAK dikirim ke AI di sini.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb, type AppDb } from "@/db/client";
import { githubChanges, webhookDeliveries } from "@/db/schema";

/** Batas ukuran kiriman yang diterima. GitHub memotong kiriman di 25 MB; push biasa jauh lebih kecil. */
export const MAX_WEBHOOK_BYTES = 5 * 1024 * 1024;
const MAX_COMMITS = 200;
const MAX_FILES = 300;
const MAX_TITLE = 300;
const MAX_BODY = 10_000;

export function verifySignature(secret: string, body: Uint8Array, header: string | null): boolean {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type WebhookOutcome = {
  /** Kode HTTP untuk GitHub. 2xx berarti "sudah diterima, jangan dikirim ulang". */
  status: number;
  message: string;
  stored: number;
};

type Repository = { full_name?: unknown; default_branch?: unknown };

type PullRequestPayload = {
  action?: unknown;
  repository?: Repository;
  pull_request?: {
    number?: unknown;
    title?: unknown;
    body?: unknown;
    html_url?: unknown;
    merged?: unknown;
    merged_at?: unknown;
    base?: { ref?: unknown };
  };
};

type PushCommit = {
  id?: unknown;
  message?: unknown;
  url?: unknown;
  timestamp?: unknown;
  distinct?: unknown;
  added?: unknown;
  modified?: unknown;
  removed?: unknown;
};

type PushPayload = { ref?: unknown; repository?: Repository; commits?: unknown };

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fileList(commit: PushCommit): string[] {
  const all = [commit.added, commit.modified, commit.removed].flatMap((list) =>
    Array.isArray(list) ? list.filter((f): f is string => typeof f === "string") : [],
  );
  return [...new Set(all)].slice(0, MAX_FILES);
}

/**
 * Commit yang sebenarnya hasil merge PR (merge commit "Merge pull request #12 ..." atau squash
 * "Judul (#12)"). Sudah tercakup event pull_request, jadi tidak masuk daftar "perlu ditinjau".
 */
export function isPullRequestMergeCommit(message: string): boolean {
  const firstLine = message.split("\n", 1)[0].trim();
  return /^Merge pull request #\d+/.test(firstLine) || /\(#\d+\)$/.test(firstLine);
}

function sameRepo(repository: Repository | undefined, configured: string): boolean {
  return typeof repository?.full_name === "string" && repository.full_name.toLowerCase() === configured.toLowerCase();
}

/**
 * Memproses satu kiriman yang tanda tangannya SUDAH diverifikasi. `configuredRepo` adalah repo dari
 * Pengaturan (atau null bila belum diatur).
 */
export function handleWebhook(
  input: { event: string; deliveryId: string; payload: unknown; configuredRepo: string | null },
  db: AppDb = getDb(),
  now: Date = new Date(),
): WebhookOutcome {
  const { event, deliveryId, payload, configuredRepo } = input;
  if (event === "ping") return { status: 200, message: "pong", stored: 0 };
  if (!configuredRepo) return { status: 202, message: "Repo belum diatur di Pengaturan; diabaikan.", stored: 0 };
  if (typeof payload !== "object" || payload === null) return { status: 400, message: "Isi tidak valid.", stored: 0 };

  const repository = (payload as { repository?: Repository }).repository;
  if (!sameRepo(repository, configuredRepo)) {
    return { status: 202, message: "Bukan repo yang dipakai; diabaikan.", stored: 0 };
  }
  const repo = String(repository!.full_name);
  const mainBranch = typeof repository?.default_branch === "string" ? repository.default_branch : "main";

  return db.transaction((tx) => {
    // Kiriman ulang (ID pengiriman yang sama) tidak diproses dua kali.
    const fresh = tx
      .insert(webhookDeliveries)
      .values({ deliveryId: deliveryId.slice(0, 100), event: event.slice(0, 50), receivedAt: now })
      .onConflictDoNothing()
      .returning({ id: webhookDeliveries.deliveryId })
      .all();
    if (fresh.length === 0) return { status: 200, message: "Sudah pernah diterima.", stored: 0 };

    if (event === "pull_request") {
      const p = payload as PullRequestPayload;
      const pr = p.pull_request;
      if (p.action !== "closed" || pr?.merged !== true || pr.base?.ref !== mainBranch) {
        return { status: 202, message: "Bukan merge ke branch utama; diabaikan.", stored: 0 };
      }
      if (!Number.isInteger(pr.number) || (pr.number as number) < 1) {
        return { status: 400, message: "Nomor PR tidak valid.", stored: 0 };
      }
      const inserted = tx
        .insert(githubChanges)
        .values({
          repo,
          kind: "pr",
          prNumber: pr.number as number,
          title: str(pr.title, MAX_TITLE) || `PR #${pr.number}`,
          body: str(pr.body, MAX_BODY),
          url: str(pr.html_url, 500),
          happenedAt: date(pr.merged_at) ?? now,
          receivedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: githubChanges.id })
        .all();
      return {
        status: 200,
        message: inserted.length > 0 ? `PR #${pr.number} dicatat.` : `PR #${pr.number} sudah tercatat sebelumnya.`,
        stored: inserted.length,
      };
    }

    if (event === "push") {
      const p = payload as PushPayload;
      if (p.ref !== `refs/heads/${mainBranch}`) {
        return { status: 202, message: "Bukan push ke branch utama; diabaikan.", stored: 0 };
      }
      const commits = (Array.isArray(p.commits) ? (p.commits as PushCommit[]) : []).slice(0, MAX_COMMITS);
      let stored = 0;
      for (const commit of commits) {
        const sha = str(commit.id, 64);
        const message = str(commit.message, MAX_BODY + MAX_TITLE);
        if (!/^[0-9a-f]{7,64}$/.test(sha) || commit.distinct === false) continue;
        if (isPullRequestMergeCommit(message)) continue;
        const [firstLine, ...rest] = message.split("\n");
        const inserted = tx
          .insert(githubChanges)
          .values({
            repo,
            kind: "commit",
            commitSha: sha,
            title: firstLine.trim().slice(0, MAX_TITLE) || sha.slice(0, 7),
            body: rest.join("\n").trim().slice(0, MAX_BODY),
            url: str(commit.url, 500),
            files: JSON.stringify(fileList(commit)),
            happenedAt: date(commit.timestamp) ?? now,
            receivedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: githubChanges.id })
          .all();
        stored += inserted.length;
      }
      return { status: 200, message: `${stored} commit langsung dicatat.`, stored };
    }

    return { status: 202, message: `Event ${event} diabaikan.`, stored: 0 };
  });
}
