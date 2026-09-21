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
