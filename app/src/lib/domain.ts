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
