// Data Access Layer: satu-satunya pintu untuk mengetahui siapa yang sedang login.
// Pemeriksaan di sini adalah pemeriksaan "aman" (membaca database), bukan sekadar cookie.
// Panggil requireUser/requireAdmin di SETIAP halaman dan server action, bukan hanya di layout,
// karena layout tidak dirender ulang saat navigasi antarhalaman.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { readSessionToken } from "@/lib/session";

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  return token ? getSessionUser(token) : null;
});

export async function requireUser(
  options: { allowPasswordChange?: boolean } = {},
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/masuk");
  // Kata sandi sementara harus diganti sebelum boleh memakai bagian lain.
  if (user.mustChangePassword && !options.allowPasswordChange) {
    redirect("/ganti-kata-sandi");
  }
  return user;
}

/** Hanya Admin. Pengguna lain dialihkan ke beranda tanpa melihat isi halaman. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/");
  return user;
}
