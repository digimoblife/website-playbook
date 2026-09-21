import type { Audience, Role, Status } from "@/lib/domain";

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
