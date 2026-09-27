"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateAiDraft } from "@/lib/ai-draft";
import { pullFromGithub } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { getPullRequestDetail } from "@/lib/github-api";
import { getGithubConfig } from "@/lib/settings";
import { createEntryFromCommit, getGithubChange, markGithubChangeReviewed } from "@/lib/github-changes";

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

// ---------- Perubahan dari webhook (Langkah 6c), ditindaklanjuti dari Inbox ----------

export type ChangeActionResult = { ok: true; message: string } | { ok: false; error: string };

function parseId(formData: FormData): number | null {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function revalidateInbox(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/entri");
}

export async function markChangeReviewedAction(
  _prev: ChangeActionResult | undefined,
  formData: FormData,
): Promise<ChangeActionResult> {
  const admin = await requireAdmin();
  const id = parseId(formData);
  if (!id) return { ok: false, error: "Perubahan tidak valid." };
  const result = markGithubChangeReviewed(id, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateInbox();
  return { ok: true, message: "Ditandai sudah ditinjau." };
}

/** Commit langsung: buat entri draf (tanpa AI) berjudul pesan commit, lalu buka editornya. */
export async function createEntryFromCommitAction(
  _prev: ChangeActionResult | undefined,
  formData: FormData,
): Promise<ChangeActionResult> {
  const admin = await requireAdmin();
  const id = parseId(formData);
  if (!id) return { ok: false, error: "Perubahan tidak valid." };
  const result = createEntryFromCommit(id, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateInbox();
  redirect(`/admin/entri/${result.entryId}`);
}

/** PR yang di-merge: buat draf AI (alur yang sama dengan "Tarik dari GitHub"), lalu buka editornya. */
export async function draftFromPullRequestAction(
  _prev: ChangeActionResult | undefined,
  formData: FormData,
): Promise<ChangeActionResult> {
  const admin = await requireAdmin();
  const id = parseId(formData);
  if (!id) return { ok: false, error: "Perubahan tidak valid." };
  const change = getGithubChange(id);
  if (!change || change.kind !== "pr" || change.prNumber === null) return { ok: false, error: "PR tidak ditemukan." };
  if (change.state === "ditinjau") return { ok: false, error: "Perubahan ini sudah ditinjau." };

  const config = getGithubConfig();
  if (!config) return { ok: false, error: "Repo GitHub belum diatur. Isi dulu di menu Pengaturan." };
  if (config.repo.toLowerCase() !== change.repo.toLowerCase()) {
    return { ok: false, error: `PR ini dari ${change.repo}, sedangkan Pengaturan memakai ${config.repo}.` };
  }

  const detail = await getPullRequestDetail(config, change.prNumber);
  if (!detail.ok) return { ok: false, error: detail.error };
  const pr = detail.data;
  const draft = await generateAiDraft({ prTitle: pr.title, prBody: pr.body, files: pr.files });
  if (draft.status !== "ok") return { ok: false, error: draft.message };

  // Selalu Internal/Internal dan belum terbit (pullFromGithub memaksanya).
  const result = pullFromGithub(
    { number: pr.number, title: pr.title, url: pr.url, repo: config.repo },
    draft.draft,
    admin.id,
  );
  if (!result.ok) return { ok: false, error: result.error };
  markGithubChangeReviewed(id, admin.id, undefined, result.id);
  revalidateInbox();
  revalidatePath("/admin/github");
  redirect(`/admin/entri/${result.id}`);
}
