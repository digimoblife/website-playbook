import type { Audience, Kind, MediaKind, Nature, Role, Status } from "@/lib/domain";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  marketing: "Marketing internal",
  partner: "Partner JV",
};

export const STATUS_LABEL: Record<Status, string> = {
  internal: "Internal",
  beta: "Beta",
  siap: "Siap diumumkan",
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  internal: "Internal saja",
  marketing: "Marketing",
  partner: "Marketing dan Partner",
};

/** Halaman tujuan setelah login: Admin ke dashboard, lainnya ke beranda website. */
export function homePathFor(role: Role): string {
  return role === "admin" ? "/admin" : "/";
}

export const KIND_LABEL: Record<Kind, string> = {
  core: "Fitur inti",
  addon: "Add-on",
};

export const NATURE_LABEL: Record<Nature, string> = {
  new: "Baru",
  update: "Pembaruan",
};

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  screenshot: "Screenshot",
  gif: "GIF",
  promo: "Gambar promosi",
};
