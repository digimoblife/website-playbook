"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import {
  archiveGuide,
  createGuide,
  publishGuide,
  restoreGuide,
  saveGuide,
  unpublishGuide,
  type EditableGuide,
} from "@/lib/guides";
import type { Result } from "@/lib/admin-entries";

// Setiap action di sini memanggil requireAdmin() PERTAMA, sebelum membaca input apa pun.
// Pengguna selain Admin dialihkan dan tidak ada yang berubah di database.

export type GuideActionResult =
  | { ok: true; message: string; guide?: EditableGuide }
  | { ok: false; error: string };

function revalidateGuides(): void {
  revalidatePath("/admin/panduan");
  revalidatePath("/admin/panduan/[id]", "page");
  revalidatePath("/panduan");
}

function parseId(formData: FormData): number | null {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createGuideAction(
  _prev: GuideActionResult | undefined,
  formData: FormData,
): Promise<GuideActionResult> {
  const admin = await requireAdmin();
  const result = createGuide({ title: formData.get("title"), actorId: admin.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidateGuides();
  redirect(`/admin/panduan/${result.id}`);
}

export async function saveGuideAction(id: number, input: unknown): Promise<GuideActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Panduan tidak valid." };
  const result = saveGuide(id, input, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateGuides();
  return {
    ok: true,
    message: result.changed ? "Perubahan disimpan." : "Tidak ada perubahan untuk disimpan.",
    guide: result.guide,
  };
}

async function lifecycle(
  formData: FormData,
  run: (id: number, actorId: number) => Result<{ guide: EditableGuide; message: string }>,
): Promise<GuideActionResult> {
  const admin = await requireAdmin();
  const id = parseId(formData);
  if (!id) return { ok: false, error: "Panduan tidak valid." };
  const result = run(id, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateGuides();
  return { ok: true, message: result.message, guide: result.guide };
}

export async function publishGuideAction(
  _prev: GuideActionResult | undefined,
  formData: FormData,
): Promise<GuideActionResult> {
  return lifecycle(formData, (id, actorId) => publishGuide(id, actorId));
}

export async function unpublishGuideAction(
  _prev: GuideActionResult | undefined,
  formData: FormData,
): Promise<GuideActionResult> {
  return lifecycle(formData, (id, actorId) => unpublishGuide(id, actorId));
}

export async function archiveGuideAction(
  _prev: GuideActionResult | undefined,
  formData: FormData,
): Promise<GuideActionResult> {
  return lifecycle(formData, (id, actorId) => archiveGuide(id, actorId));
}

export async function restoreGuideAction(
  _prev: GuideActionResult | undefined,
  formData: FormData,
): Promise<GuideActionResult> {
  return lifecycle(formData, (id, actorId) => restoreGuide(id, actorId));
}
