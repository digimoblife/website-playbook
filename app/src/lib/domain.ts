// Konstanta domain. Tanpa impor apa pun supaya aman dipakai oleh skema, akses, dan tes.

export const ROLES = ["admin", "marketing", "partner"] as const;
export type Role = (typeof ROLES)[number];

// Status kesiapan: "siap" berarti "Siap diumumkan".
export const STATUSES = ["internal", "beta", "siap"] as const;
export type Status = (typeof STATUSES)[number];

// Audiens: "partner" berarti "Marketing dan Partner".
export const AUDIENCES = ["internal", "marketing", "partner"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const KINDS = ["core", "addon"] as const;
export type Kind = (typeof KINDS)[number];

export const NATURES = ["new", "update"] as const;
export type Nature = (typeof NATURES)[number];

export const MEDIA_KINDS = ["screenshot", "gif", "promo"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_SOURCES = ["auto", "manual"] as const;
export type MediaSource = (typeof MEDIA_SOURCES)[number];

// Perubahan yang masuk lewat webhook GitHub (Langkah 6c).
export const GITHUB_CHANGE_KINDS = ["pr", "commit"] as const;
export type GithubChangeKind = (typeof GITHUB_CHANGE_KINDS)[number];
export const GITHUB_CHANGE_STATES = ["baru", "ditinjau"] as const;
export type GithubChangeState = (typeof GITHUB_CHANGE_STATES)[number];
// Hasil triase (Langkah 6d, lib/triage.ts).
export const TRIAGE_BUCKETS = ["kandidat", "perbaikan", "arsip"] as const;
export type TriageBucket = (typeof TRIAGE_BUCKETS)[number];

// Hasil terakhir skenario screenshot otomatis (Langkah 6e).
export const SCENARIO_STATUSES = ["berhasil", "gagal"] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

// Tag kebutuhan pelanggan: pilihan tetap. Yang disimpan di database adalah `key`.
export const NEEDS_TAGS = [
  { key: "menarik-pembeli", label: "Menarik pembeli" },
  { key: "mengelola-stok", label: "Mengelola stok" },
  { key: "mengelola-pesanan", label: "Mengelola pesanan" },
  { key: "dompet-penarikan", label: "Dompet dan penarikan" },
] as const;
export type NeedsTagKey = (typeof NEEDS_TAGS)[number]["key"];
export const NEEDS_TAG_KEYS: readonly NeedsTagKey[] = NEEDS_TAGS.map((t) => t.key);

/** Mem-parse kolom entries.needs_tags (larik JSON) menjadi tag yang dikenal, terurut baku. */
export function parseNeedsTags(json: string): NeedsTagKey[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return NEEDS_TAG_KEYS.filter((key) => value.includes(key));
  } catch {
    return [];
  }
}

// Batas isian. Dipakai server (validasi) dan editor (atribut maxLength).
export const LIMITS = {
  title: 120,
  slug: 80,
  summary: 200,
  longText: 3000,
  stepText: 300,
  steps: 12,
  imagesPerEntry: 20,
  historyPageSize: 50,
  faqs: 10,
  faqQuestion: 200,
  faqAnswer: 500,
  guideSteps: 15,
} as const;
