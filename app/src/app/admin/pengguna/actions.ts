"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { createUser, resetUserPassword, setUserActive, updateUserDetails } from "@/lib/users";

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

export type ResetPasswordState =
  | { ok: true; message: string; tempPassword: string }
  | { ok: false; error: string }
  | undefined;

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const admin = await requireAdmin();
  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId)) return { ok: false, error: "Akun tidak valid." };
  const result = await resetUserPassword({ targetId, actingUserId: admin.id });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/pengguna");
  return {
    ok: true,
    message: `Kata sandi ${result.user.name} direset dan semua sesinya dicabut.`,
    // Hanya dikirim sekali ini; di database hanya tersimpan hash-nya.
    tempPassword: result.tempPassword,
  };
}

export type UpdateUserState = { ok: true; message: string } | { ok: false; error: string } | undefined;

export async function updateUserAction(
  _prev: UpdateUserState,
  formData: FormData,
): Promise<UpdateUserState> {
  const admin = await requireAdmin();
  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId)) return { ok: false, error: "Akun tidak valid." };
  const result = updateUserDetails({
    targetId,
    actingUserId: admin.id,
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    partnerName: String(formData.get("partnerName") ?? ""),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/admin/pengguna");
  return { ok: true, message: "Data akun disimpan." };
}
