"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveEntry,
  createEntry,
  publishEntry,
  restoreEntry,
  saveEntry,
  unpublishEntry,
  type EditableEntry,
  type Result,
} from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { deleteImage } from "@/lib/media";

// Setiap action di sini memanggil requireAdmin() PERTAMA, sebelum membaca input apa pun.
// Pengguna selain Admin dialihkan dan tidak ada yang berubah di database.

export type ActionResult =
  | { ok: true; message: string; entry?: EditableEntry }
  | { ok: false; error: string };

function revalidateEntries(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/entri");
  revalidatePath("/admin/entri/[id]", "page");
  revalidatePath("/admin/arsip");
  revalidatePath("/admin/riwayat");
}

function parseId(formData: FormData): number | null {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function createEntryAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const result = createEntry({ title: formData.get("title"), actorId: admin.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidateEntries();
  redirect(`/admin/entri/${result.id}`);
}

export async function saveEntryAction(id: number, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Entri tidak valid." };
  const result = saveEntry(id, input, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateEntries();
  return {
    ok: true,
    message: result.changed ? "Perubahan disimpan." : "Tidak ada perubahan untuk disimpan.",
    entry: result.entry,
  };
}

async function lifecycle(
  formData: FormData,
  run: (id: number, actorId: number) => Result<{ entry: EditableEntry; message: string }>,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = parseId(formData);
  if (!id) return { ok: false, error: "Entri tidak valid." };
  const result = run(id, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateEntries();
  return { ok: true, message: result.message, entry: result.entry };
}

export async function publishEntryAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  return lifecycle(formData, (id, actorId) => publishEntry(id, actorId));
}

export async function unpublishEntryAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  return lifecycle(formData, (id, actorId) => unpublishEntry(id, actorId));
}

export async function archiveEntryAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  return lifecycle(formData, (id, actorId) => archiveEntry(id, actorId));
}

export async function restoreEntryAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  return lifecycle(formData, (id, actorId) => restoreEntry(id, actorId));
}

export async function deleteMediaAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = parseId(formData);
  if (!id) return { ok: false, error: "Gambar tidak valid." };
  const result = await deleteImage(id, admin.id);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateEntries();
  return { ok: true, message: "Gambar dihapus." };
}
