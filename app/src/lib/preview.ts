// "Lihat sebagai": alat pratinjau untuk Admin di website (bukan dashboard).
//
// Admin yang melihat website dalam pandangan Admin (semua entri, semua kolom) tidak berguna
// sebagai alat pratinjau, jadi Admin selalu dipetakan ke viewer SINTETIS "marketing" atau
// "partner" saat membuka halaman website. Cookie ini HANYA berarti untuk Admin; untuk Marketing
// dan Partner sungguhan, nilainya diabaikan total (lihat getWebsiteViewer di bawah) — mereka
// selalu memakai peran akun mereka sendiri, apa pun isi cookie ini.
//
// Nama cookie dan tipe PreviewRole ada di preview-constants.ts (TANPA "server-only") supaya
// komponen klien seperti PreviewSwitch bisa memakainya tanpa menarik next/headers ke bundel klien.
import "server-only";
import { cookies } from "next/headers";
import { isAdmin, type Viewer } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { DEFAULT_PREVIEW_ROLE, isPreviewRole, PREVIEW_COOKIE, type PreviewRole } from "@/lib/preview-constants";
import { runDueSchedules } from "@/lib/schedule";

export {
  DEFAULT_PREVIEW_ROLE,
  isPreviewRole,
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_MAX_AGE_SECONDS,
  PREVIEW_ROLES,
  type PreviewRole,
} from "@/lib/preview-constants";

/** Nilai cookie pratinjau saat ini, atau default bila belum pernah memilih. Hanya berarti bagi Admin. */
export async function getPreviewRole(): Promise<PreviewRole> {
  const raw = (await cookies()).get(PREVIEW_COOKIE)?.value;
  return isPreviewRole(raw) ? raw : DEFAULT_PREVIEW_ROLE;
}

/**
 * Viewer yang dipakai HALAMAN WEBSITE (bukan dashboard admin) untuk memutuskan apa yang boleh
 * dilihat. Admin selalu dipetakan ke viewer sintetis { role: pratinjau, active: true } — bukan
 * viewer Admin asli — sehingga Admin melihat persis seperti akun Marketing/Partner sungguhan,
 * termasuk penyaringan cannotPromise oleh lib/entries.ts. Marketing dan Partner sungguhan selalu
 * memakai peran akun mereka sendiri; cookie pratinjau tidak pernah dibaca untuk mereka.
 */
export async function getWebsiteViewer(user: SessionUser): Promise<Viewer> {
  // Setiap halaman website memanggil fungsi ini sebelum membaca entri, jadi jadwal publish yang
  // sudah jatuh tempo diterbitkan dulu di sini (lib/schedule.ts).
  runDueSchedules();
  if (!isAdmin(user)) return { role: user.role, active: user.active };
  const role = await getPreviewRole();
  return { role, active: true };
}
