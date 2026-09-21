"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { createUser, setUserActive } from "@/lib/users";

export type CreateUserState =
  | { error?: string; success?: string; tempPassword?: string; email?: string }
  | undefined;

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();
  const result = await createUser({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    partnerName: String(formData.get("partnerName") ?? ""),
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/pengguna");
  return {
    success: `Akun ${result.user.name} berhasil dibuat.`,
    email: result.user.email,
    // Hanya dikirim sekali ini. Tidak disimpan di mana pun selain sebagai hash di database.
    tempPassword: result.tempPassword,
  };
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId)) return;
  setUserActive({
    targetId,
    active: formData.get("active") === "true",
    actingUserId: admin.id,
  });
  revalidatePath("/admin/pengguna");
}
