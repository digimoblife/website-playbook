"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { isPreviewRole, PREVIEW_COOKIE, PREVIEW_COOKIE_MAX_AGE_SECONDS } from "@/lib/preview-constants";

// Hanya Admin yang boleh memanggil ini (diperiksa lewat DAL, seperti Server Action lain).
// Untuk Marketing dan Partner cookie ini tidak berarti apa pun (lihat lib/preview.ts), tetapi
// aksinya sendiri tetap ditolak untuk peran selain Admin, konsisten dengan pola Langkah 2.
export async function setPreviewRoleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const role = formData.get("peran");
  if (typeof role === "string" && isPreviewRole(role)) {
    (await cookies()).set(PREVIEW_COOKIE, role, {
      httpOnly: false, // dibaca juga oleh kontrol pratinjau di klien, bukan rahasia
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PREVIEW_COOKIE_MAX_AGE_SECONDS,
    });
  }
  const back = formData.get("kembali");
  redirect(typeof back === "string" && back ? back : "/");
}
