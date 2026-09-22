// Dipisah dari preview.ts (yang bertanda "server-only") supaya komponen KLIEN seperti
// PreviewSwitch bisa memakai nama dan tipe peran pratinjau tanpa menarik next/headers.
export const PREVIEW_COOKIE = "pratinjau_peran";
export const PREVIEW_ROLES = ["marketing", "partner"] as const;
export type PreviewRole = (typeof PREVIEW_ROLES)[number];
export const DEFAULT_PREVIEW_ROLE: PreviewRole = "marketing";

// Cukup untuk berpindah pratinjau selama sesi kerja; bukan sesi login, jadi umurnya pendek.
export const PREVIEW_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 1 hari

export function isPreviewRole(value: string | undefined | null): value is PreviewRole {
  return !!value && (PREVIEW_ROLES as readonly string[]).includes(value);
}
