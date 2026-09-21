"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { attemptLogin, deleteSession } from "@/lib/auth";
import { homePathFor } from "@/lib/labels";
import { readSessionToken, setSessionCookie } from "@/lib/session";

export type LoginState = { error?: string; email?: string } | undefined;

// Dipakai hanya untuk membatasi percobaan login. Asumsinya aplikasi berjalan di belakang TEPAT
// SATU reverse proxy (Nginx/Caddy) yang menambahkan IP klien di ujung X-Forwarded-For, dan
// tidak bisa diakses langsung dari internet (lihat README). Entri pertama header itu bisa
// dipalsukan klien, jadi yang dipakai adalah entri terakhir, yang ditulis proxy kita.
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  return forwarded || h.get("x-real-ip")?.trim() || "tidak-diketahui";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await attemptLogin({ email, password, ip: await clientIp() });
  if (!result.ok) {
    return {
      email,
      error:
        result.reason === "locked"
          ? "Terlalu banyak percobaan yang gagal. Coba lagi dalam 15 menit."
          : "Email atau kata sandi salah.",
    };
  }

  const previous = await readSessionToken();
  if (previous) deleteSession(previous);
  await setSessionCookie(result.token, result.expiresAt);
  redirect(result.user.mustChangePassword ? "/ganti-kata-sandi" : homePathFor(result.user.role));
}
