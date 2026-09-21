"use server";

import { redirect } from "next/navigation";
import { changePassword, createSession } from "@/lib/auth";
import { requireUser } from "@/lib/dal";
import { homePathFor } from "@/lib/labels";
import { setSessionCookie } from "@/lib/session";

export type ChangePasswordState = { error?: string } | undefined;

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser({ allowPasswordChange: true });
  const currentPassword = String(formData.get("current") ?? "");
  const newPassword = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (newPassword !== confirm) {
    return { error: "Kata sandi baru dan pengulangannya tidak sama." };
  }
  const result = await changePassword({ userId: user.id, currentPassword, newPassword });
  if (!result.ok) return { error: result.error };

  // changePassword mencabut semua sesi lama; buat sesi baru untuk perangkat ini.
  const session = createSession(user.id);
  await setSessionCookie(session.token, session.expiresAt);
  redirect(homePathFor(user.role));
}
