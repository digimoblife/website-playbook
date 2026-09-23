// Klien GitHub REST API hanya-baca (percobaan Langkah 4-experimental). Terpisah dari `gh` CLI
// lokal (dipakai manusia di terminal, lihat CLAUDE.md aturan 2) — ini dipanggil oleh server lewat
// fetch bawaan Node dengan GITHUB_TOKEN dari environment. Tidak pernah menulis ke GitHub.
const GITHUB_API = "https://api.github.com";

export type PullRequestSummary = {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  merged: boolean;
  updatedAt: string;
};

export type PullRequestDetail = PullRequestSummary & {
  body: string;
  /** Nama file yang berubah saja, bukan isi diff — cukup untuk AI menebak area fitur. */
  files: string[];
};

export type GithubResult<T> = { ok: true; data: T } | { ok: false; error: string };

function repoSlug(): string {
  return process.env.GITHUB_REPO?.trim() || "bajaklautmalaka/lapaq";
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function rateLimitMessage(res: Response): string {
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining === "0") {
    const resetHeader = res.headers.get("x-ratelimit-reset");
    const resetAt = resetHeader
      ? new Date(Number(resetHeader) * 1000).toLocaleString("id-ID")
      : "beberapa saat lagi";
    return `Batas panggilan GitHub API tercapai. Coba lagi setelah ${resetAt}.`;
  }
  return "GitHub menolak permintaan ini (403). Periksa GITHUB_TOKEN.";
}

async function githubGet(path: string): Promise<GithubResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: authHeaders(), cache: "no-store" });
  } catch {
    return { ok: false, error: "Tidak bisa terhubung ke GitHub. Periksa koneksi internet server." };
  }
  if (res.status === 401) return { ok: false, error: "GITHUB_TOKEN tidak valid atau kedaluwarsa." };
  if (res.status === 403 || res.status === 429) return { ok: false, error: rateLimitMessage(res) };
  if (res.status === 404) return { ok: false, error: "Repositori atau data tidak ditemukan di GitHub." };
  if (!res.ok) return { ok: false, error: `GitHub mengembalikan galat (${res.status}).` };
  try {
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, error: "Balasan GitHub tidak bisa dibaca (bukan JSON yang sah)." };
  }
}

type RawPull = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged_at: string | null;
  updated_at: string;
  body: string | null;
};

function toSummary(pr: RawPull): PullRequestSummary {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state: pr.state === "closed" ? "closed" : "open",
    merged: pr.merged_at !== null,
    updatedAt: pr.updated_at,
  };
}

/** PR terbuka DAN tertutup/merged, terbaru dulu. */
export async function listPullRequests(): Promise<GithubResult<PullRequestSummary[]>> {
  const res = await githubGet(`/repos/${repoSlug()}/pulls?state=all&per_page=100&sort=created&direction=desc`);
  if (!res.ok) return res;
  const rows = res.data as RawPull[];
  return { ok: true, data: rows.map(toSummary) };
}

/** Judul, deskripsi, dan nama file yang berubah (bukan isi diff) untuk satu PR. */
export async function getPullRequestDetail(number: number): Promise<GithubResult<PullRequestDetail>> {
  const prRes = await githubGet(`/repos/${repoSlug()}/pulls/${number}`);
  if (!prRes.ok) return prRes;
  const filesRes = await githubGet(`/repos/${repoSlug()}/pulls/${number}/files?per_page=100`);
  if (!filesRes.ok) return filesRes;

  const pr = prRes.data as RawPull;
  const files = (filesRes.data as { filename: string }[]).map((f) => f.filename);
  return { ok: true, data: { ...toSummary(pr), body: pr.body ?? "", files } };
}
