// Menggabungkan daftar PR dari GitHub dengan status "sudah/belum ditarik" (github_imports),
// dipakai halaman /admin/github. Bukan sumber kebenaran baru: hanya menempel status baca-database
// ke atas lib/github-api.ts (yang murni memanggil GitHub, tidak tahu apa-apa soal entri kita).
import { getDb, type AppDb } from "@/db/client";
import { githubImports } from "@/db/schema";
import { listPullRequests, type GithubResult, type PullRequestSummary } from "@/lib/github-api";

export type ImportRecord = { entryId: number; importedAt: Date };

export type PullRequestWithStatus = PullRequestSummary & {
  /** Kosong berarti belum pernah ditarik. Bisa lebih dari satu: PR boleh ditarik berkali-kali. */
  imports: ImportRecord[];
};

export async function listPullRequestsWithStatus(
  db: AppDb = getDb(),
): Promise<GithubResult<PullRequestWithStatus[]>> {
  const prsRes = await listPullRequests();
  if (!prsRes.ok) return prsRes;

  const rows = db
    .select({ prNumber: githubImports.prNumber, entryId: githubImports.entryId, importedAt: githubImports.importedAt })
    .from(githubImports)
    .all();

  const byPrNumber = new Map<number, ImportRecord[]>();
  for (const row of rows) {
    const list = byPrNumber.get(row.prNumber) ?? [];
    list.push({ entryId: row.entryId, importedAt: row.importedAt });
    byPrNumber.set(row.prNumber, list);
  }

  return {
    ok: true,
    data: prsRes.data.map((pr) => ({ ...pr, imports: byPrNumber.get(pr.number) ?? [] })),
  };
}
