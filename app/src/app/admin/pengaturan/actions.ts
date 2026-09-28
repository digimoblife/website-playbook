"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { checkRepoAccess } from "@/lib/github-api";
import { clearGithubToken, getGithubConfig, saveGeneralSettings, setGithubToken } from "@/lib/settings";

// Setiap action di sini memanggil requireAdmin() PERTAMA, sebelum membaca input apa pun.
// Nilai token tidak pernah dikembalikan ke browser, dicatat di riwayat, atau dicetak ke log.

export type SettingsActionResult =
  | { ok: true; message: string; warning?: string }
  | { ok: false; error: string };

function revalidateAll(): void {
  // Nama produk tampil di semua halaman (navbar, sidebar, login, judul).
  revalidatePath("/", "layout");
}

export async function saveSettingsAction(
  _prev: SettingsActionResult | undefined,
  formData: FormData,
): Promise<SettingsActionResult> {
  const admin = await requireAdmin();
  const result = saveGeneralSettings(
    {
      productName: formData.get("productName"),
      githubRepo: formData.get("githubRepo"),
      demoStoreUrl: formData.get("demoStoreUrl"),
    },
    admin.id,
  );
  if (!result.ok) return { ok: false, error: result.error };
  if (result.changed) revalidateAll();
  return { ok: true, message: result.message };
}

export async function saveGithubTokenAction(
  _prev: SettingsActionResult | undefined,
  formData: FormData,
): Promise<SettingsActionResult> {
  const admin = await requireAdmin();
  const result = setGithubToken(formData.get("token"), admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/github");
  return { ok: true, message: result.message };
}

// Tanpa parameter: tidak ada input yang dibaca. Tetap cocok dipakai useActionState.
export async function clearGithubTokenAction(): Promise<SettingsActionResult> {
  const admin = await requireAdmin();
  const result = clearGithubToken(admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/pengaturan");
  revalidatePath("/admin/github");
  return { ok: true, message: result.message };
}

/** Uji koneksi: satu permintaan baca ke GitHub memakai repo dan token yang sedang berlaku. */
export async function testGithubConnectionAction(): Promise<SettingsActionResult> {
  await requireAdmin();
  const config = getGithubConfig();
  if (!config) return { ok: false, error: "Repo GitHub belum diatur. Isi dan simpan dulu di atas." };
  const result = await checkRepoAccess(config);
  if (!result.ok) return { ok: false, error: result.error };
  const { fullName, isPrivate, canWrite, hasToken } = result.data;
  return {
    ok: true,
    message: `Terhubung ke ${fullName} (${isPrivate ? "privat" : "publik"})${hasToken ? "" : ", tanpa token"}.`,
    warning: canWrite
      ? "Token ini punya akses TULIS ke repo. Aplikasi tidak pernah menulis ke GitHub, tetapi sebaiknya ganti dengan fine-grained token yang hanya-baca (Contents dan Pull requests: Read-only)."
      : undefined,
  };
}
