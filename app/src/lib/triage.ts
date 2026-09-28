// Triase perubahan dari GitHub (Langkah 6d). Murni: tanpa database, dipakai webhook dan Inbox.
//
// Aturan (disetujui Product Manager, 28 September 2026):
//  1. Tipe Conventional Commits docs, test, chore, style, dan copy masuk Arsip GitHub.
//  2. Tipe fix masuk daftar Perbaikan (jarang ditinjau).
//  3. Selain itu (feat, refactor, tanpa tipe, dan lainnya) menjadi kandidat di Inbox. Fitur inti
//     dan add-on sama-sama kandidat: Jenis hanya label, bukan saringan.
//  4. Trailer "Fitur: slug" mengelompokkan perubahan per fitur (lihat groupKey di github-changes.ts).
// Admin selalu bisa mengembalikan perubahan dari Arsip atau Perbaikan menjadi kandidat.
//
// Tebakan Jenis mengikuti audit/validasi-jenis.md: aturan lama "semua jalur add-on" hanya sekitar
// 20 persen benar, jadi yang dipakai hanya file layanan add-on tertentu dan nama add-on di judul.
// Tebakan selalu ditampilkan sebagai tebakan; Admin yang memutuskan.
import type { Kind, TriageBucket } from "./domain";

export { TRIAGE_BUCKETS, type TriageBucket } from "./domain";

export const ARCHIVE_TYPES = ["docs", "test", "chore", "style", "copy"] as const;

/** Tipe Conventional Commits dari judul ("feat(stok)!: ..." -> "feat"), huruf kecil, atau null. */
export function commitType(title: string): string | null {
  const match = title.trim().match(/^([A-Za-z]+)(?:\([^)]*\))?!?:\s/);
  return match ? match[1].toLowerCase() : null;
}

export function triageBucket(title: string): TriageBucket {
  const type = commitType(title);
  if (type && (ARCHIVE_TYPES as readonly string[]).includes(type)) return "arsip";
  if (type === "fix") return "perbaikan";
  return "kandidat";
}

/** Slug dari trailer "Fitur: slug" (boleh lebih dari satu baris), huruf kecil, tanpa duplikat. */
export function fiturSlugs(text: string): string[] {
  const slugs = [...text.matchAll(/^\s*Fitur:\s*([A-Za-z0-9-]+)\s*$/gim)].map((m) => m[1].toLowerCase());
  return [...new Set(slugs)];
}

// File sistem add-on di repo Lapaq: hak akses, definisi, penagihan, dan versi. Perubahan di sini
// adalah Fitur inti (Katalog dan pembelian add-on), bukan add-on tertentu.
const ADDON_PLATFORM_FILES = new Set(["access", "billing", "definitions", "entitlements", "releases"]);
const ADDON_SERVICE_FILE = /^src\/services\/add-ons\/([a-z0-9-]+)\.tsx?$/;

export type KindGuess = { kind: Kind; reason: string; area: string | null };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Tebakan Jenis untuk perubahan TANPA trailer "Fitur:" yang cocok. `addonNames` berisi judul dan
 * slug entri berjenis Add-on (dari database), supaya add-on baru ikut terhitung tanpa ubah kode.
 */
export function guessKind(input: { title: string; files: string[] }, addonNames: string[]): KindGuess {
  const area = input.files.length > 0 && input.files.every((f) => f.includes("/superadmin/"))
    ? "area superadmin (internal Lapaq)"
    : null;

  const serviceFile = input.files
    .map((f) => f.match(ADDON_SERVICE_FILE)?.[1])
    .find((name): name is string => !!name && !ADDON_PLATFORM_FILES.has(name));
  if (serviceFile) return { kind: "addon", reason: `menyentuh layanan add-on ${serviceFile}`, area };

  const title = ` ${normalize(input.title)} `;
  const named = addonNames
    .map((name) => normalize(name.replace(/-/g, " ")))
    .find((name) => name.length >= 4 && title.includes(` ${name} `));
  if (named) return { kind: "addon", reason: `judul menyebut add-on "${named}"`, area };

  return { kind: "core", reason: "tidak ada tanda add-on", area };
}
