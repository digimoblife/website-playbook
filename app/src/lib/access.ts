// Satu-satunya tempat aturan akses konten. Semua halaman dan query memakai modul ini.
//
// Aturan (blueprint, "Alur kerja dan aturan status"):
//  - Admin melihat semua entri, termasuk yang belum terbit.
//  - Marketing dan Partner hanya melihat entri yang sudah terbit, berstatus bukan
//    "internal", dan audiensnya mencakup peran mereka.
//      Marketing -> audiens "marketing" dan "partner" (Marketing dan Partner)
//      Partner   -> audiens "partner" saja
//  - Kolom cannot_promise ("Jangan dijanjikan") hanya untuk Admin dan Marketing.
//  - Pengguna tidak dikenal, nonaktif, atau berperan tidak dikenal tidak melihat apa pun.
import { AUDIENCES, type Audience, type Role, type Status } from "./domain";

export type Viewer = { role: Role; active?: boolean } | null | undefined;

export type EntryAccessFields = {
  isPublished: boolean;
  status: Status;
  audience: Audience;
  /** Entri terarsip tidak pernah terlihat oleh pembaca (hanya Admin). */
  archivedAt?: Date | null;
};

const AUDIENCES_BY_READER_ROLE: Record<"marketing" | "partner", readonly Audience[]> = {
  marketing: ["marketing", "partner"],
  partner: ["partner"],
};

function isActiveViewer(viewer: Viewer): viewer is NonNullable<Viewer> {
  return !!viewer && viewer.active !== false;
}

export function isAdmin(viewer: Viewer): boolean {
  return isActiveViewer(viewer) && viewer.role === "admin";
}

/** Audiens yang boleh dilihat suatu peran. Peran tidak dikenal mendapat daftar kosong. */
export function visibleAudiences(role: string): readonly Audience[] {
  if (role === "admin") return AUDIENCES;
  if (role === "marketing") return AUDIENCES_BY_READER_ROLE.marketing;
  if (role === "partner") return AUDIENCES_BY_READER_ROLE.partner;
  return [];
}

export function canView(viewer: Viewer, entry: EntryAccessFields): boolean {
  if (!isActiveViewer(viewer)) return false;
  if (viewer.role === "admin") return true;
  if (viewer.role !== "marketing" && viewer.role !== "partner") return false;
  if (entry.archivedAt) return false;
  if (!entry.isPublished) return false;
  if (entry.status === "internal") return false;
  return visibleAudiences(viewer.role).includes(entry.audience);
}

/** Bagian "Jangan dijanjikan" tidak boleh sampai ke Partner. */
export function canSeeCannotPromise(viewer: Viewer): boolean {
  return (
    isActiveViewer(viewer) &&
    (viewer.role === "admin" || viewer.role === "marketing")
  );
}

const READER_ROLES = ["marketing", "partner"] as const;

/** Peran pembaca yang SAAT INI bisa melihat entri (memperhitungkan terbit, status, audiens, dan arsip). */
export function readersWhoCanViewNow(entry: EntryAccessFields): Role[] {
  return READER_ROLES.filter((role) => canView({ role }, entry));
}

/** Apakah entri ini sekarang terlihat oleh pembaca mana pun? Dipakai Inbox. */
export function isVisibleToReaders(entry: EntryAccessFields): boolean {
  return readersWhoCanViewNow(entry).length > 0;
}

/**
 * Peran pembaca yang akan bisa melihat entri bila entri itu diterbitkan (dan tidak diarsipkan)
 * dengan status dan audiens ini. Kosong berarti tidak akan tampil ke pembaca mana pun.
 * Dipakai untuk ringkasan di editor dan aturan publish; jangan menduplikasi aturannya di tempat lain.
 */
export function readersWhoCanView(entry: Pick<EntryAccessFields, "status" | "audience">): Role[] {
  return readersWhoCanViewNow({ isPublished: true, status: entry.status, audience: entry.audience });
}
