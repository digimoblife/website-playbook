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

/** Repo ("pemilik/repo") dan token hanya-baca. Diberikan pemanggil dari lib/settings.ts. */
export type GithubConfig = { repo: string; token?: string };

function authHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
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
  return "GitHub menolak permintaan ini (403). Periksa token GitHub di Pengaturan.";
}

async function githubGet(path: string, token: string | undefined): Promise<GithubResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}${path}`, { headers: authHeaders(token), cache: "no-store" });
  } catch {
    return { ok: false, error: "Tidak bisa terhubung ke GitHub. Periksa koneksi internet server." };
  }
  if (res.status === 401) return { ok: false, error: "Token GitHub tidak valid atau kedaluwarsa. Periksa di Pengaturan." };
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
export async function listPullRequests(config: GithubConfig): Promise<GithubResult<PullRequestSummary[]>> {
  const res = await githubGet(
    `/repos/${config.repo}/pulls?state=all&per_page=100&sort=created&direction=desc`,
    config.token,
  );
  if (!res.ok) return res;
  const rows = res.data as RawPull[];
  return { ok: true, data: rows.map(toSummary) };
}

/** Judul, deskripsi, dan nama file yang berubah (bukan isi diff) untuk satu PR. */
export async function getPullRequestDetail(
  config: GithubConfig,
  number: number,
): Promise<GithubResult<PullRequestDetail>> {
  const prRes = await githubGet(`/repos/${config.repo}/pulls/${number}`, config.token);
  if (!prRes.ok) return prRes;
  const filesRes = await githubGet(`/repos/${config.repo}/pulls/${number}/files?per_page=100`, config.token);
  if (!filesRes.ok) return filesRes;

  const pr = prRes.data as RawPull;
  const files = (filesRes.data as { filename: string }[]).map((f) => f.filename);
  return { ok: true, data: { ...toSummary(pr), body: pr.body ?? "", files } };
}

export type ConnectionCheck = {
  fullName: string;
  isPrivate: boolean;
  /** Token ini punya akses tulis atau admin ke repo. Blueprint meminta token hanya-baca. */
  canWrite: boolean;
  hasToken: boolean;
};

/** "Uji koneksi" di Pengaturan: satu GET ke repo, tidak pernah menulis apa pun ke GitHub. */
export async function checkRepoAccess(config: GithubConfig): Promise<GithubResult<ConnectionCheck>> {
  const res = await githubGet(`/repos/${config.repo}`, config.token);
  if (!res.ok) {
    return res.error.startsWith("Repositori atau data tidak ditemukan")
      ? { ok: false, error: "Repo tidak ditemukan, atau token tidak punya akses baca ke repo ini." }
      : res;
  }
  const repo = res.data as { full_name?: string; private?: boolean; permissions?: Record<string, boolean> };
  const permissions = repo.permissions ?? {};
  return {
    ok: true,
    data: {
      fullName: repo.full_name ?? config.repo,
      isPrivate: repo.private === true,
      canWrite: Boolean(permissions.push || permissions.admin || permissions.maintain),
      hasToken: Boolean(config.token),
    },
  };
}
