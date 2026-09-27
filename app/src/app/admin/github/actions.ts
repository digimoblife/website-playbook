"use server";

import { revalidatePath } from "next/cache";
import { generateAiDraft } from "@/lib/ai-draft";
import { pullFromGithub } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { getPullRequestDetail } from "@/lib/github-api";
import { getGithubConfig } from "@/lib/settings";

// requireAdmin() dipanggil PERTAMA, sebelum membaca input apa pun — pola sama seperti
// src/app/admin/entri/actions.ts. Pengguna selain Admin dialihkan dan tidak ada yang berubah.

export type PullActionResult =
  | { ok: true; entryId: number; slug: string }
  | { ok: false; error: string };

export async function pullFromGithubAction(prNumber: number): Promise<PullActionResult> {
  const admin = await requireAdmin();

  if (!Number.isInteger(prNumber) || prNumber < 1) {
    return { ok: false, error: "Nomor PR tidak valid." };
  }

  const config = getGithubConfig();
  if (!config) return { ok: false, error: "Repo GitHub belum diatur. Isi dulu di menu Pengaturan." };

  const detail = await getPullRequestDetail(config, prNumber);
  if (!detail.ok) return { ok: false, error: detail.error };
  const pr = detail.data;

  const draft = await generateAiDraft({ prTitle: pr.title, prBody: pr.body, files: pr.files });
  if (draft.status !== "ok") return { ok: false, error: draft.message };

  // Draft tidak pernah punya field status/audience — pullFromGithub selalu memaksa Internal/Internal.
  const result = pullFromGithub(
    { number: pr.number, title: pr.title, url: pr.url, repo: config.repo },
    draft.draft,
    admin.id,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/github");
  revalidatePath("/admin/entri/[id]", "page");
  return { ok: true, entryId: result.id, slug: result.slug };
}
