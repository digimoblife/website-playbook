// Aturan dan teks seputar publish. Murni (tanpa database), dipakai server dan editor.
// Siapa yang boleh melihat apa TIDAK ditentukan di sini, melainkan oleh lib/access.ts.
import { readersWhoCanView } from "./access";
import type { Audience, Status } from "./domain";
import { AUDIENCE_LABEL, STATUS_LABEL } from "./labels";

export type PublishFields = {
  summary: string;
  canPromise: string;
  cannotPromise: string;
  status: Status;
  audience: Audience;
};

/** Alasan Publish ditolak (dan tombolnya dinonaktifkan) untuk entri yang tidak akan terlihat pembaca. */
export const PUBLISH_INVISIBLE_MESSAGE =
  "Ubah status dan audiens dari Internal dulu, baru Publish. Untuk menyimpan tanpa menampilkan, pakai Simpan.";

/**
 * Bagian yang masih kurang agar entri yang AKAN terlihat pembaca boleh dipublish. Untuk entri yang
 * tidak akan terlihat (status atau audiens Internal) daftar ini kosong karena alasannya lain:
 * entri itu sama sekali tidak boleh dipublish (lihat publishBlocker).
 */
export function missingForPublish(entry: PublishFields, stepCount: number): string[] {
  if (readersWhoCanView(entry).length === 0) return [];
  const missing: string[] = [];
  if (!entry.summary.trim()) missing.push("Ringkasan");
  if (stepCount < 1) missing.push("Cara pakai (minimal satu langkah)");
  if (!entry.canPromise.trim()) missing.push("Boleh dijanjikan");
  if (!entry.cannotPromise.trim()) missing.push("Jangan dijanjikan");
  return missing;
}

/**
 * Satu-satunya pintu keputusan "boleh dipublish atau tidak" (selain entri tidak ada, terarsip,
 * atau sudah terbit). Mengembalikan pesan penolakan, atau null bila boleh.
 *  - Entri yang tidak akan terlihat pembaca mana pun ditolak: Publish tidak boleh menghasilkan
 *    is_published benar untuk entri yang tidak tampil ke siapa pun.
 *  - Entri yang akan terlihat harus lengkap.
 */
export function publishBlocker(entry: PublishFields, stepCount: number): string | null {
  if (readersWhoCanView(entry).length === 0) return PUBLISH_INVISIBLE_MESSAGE;
  const missing = missingForPublish(entry, stepCount);
  return missing.length > 0 ? publishBlockedMessage(missing) : null;
}

export function publishBlockedMessage(missing: string[]): string {
  return `Belum bisa dipublish karena entri ini akan terlihat oleh pembaca. Lengkapi dulu: ${missing.join(", ")}.`;
}

/** Ringkasan hidup dampak publikasi, ditampilkan di kartu Pengaturan publikasi. */
export function publicationSummary(entry: {
  isPublished: boolean;
  archived: boolean;
  status: Status;
  audience: Audience;
}): string {
  if (entry.archived) return "Diarsipkan. Tidak tampil ke pembaca mana pun.";
  const visible = readersWhoCanView(entry).length > 0;
  const audience = AUDIENCE_LABEL[entry.audience];
  const status = STATUS_LABEL[entry.status];
  if (entry.isPublished) {
    return visible
      ? `Diterbitkan. Tampil ke ${audience} sebagai ${status}.`
      : "Tersimpan sebagai draf internal. Belum tampil ke pembaca mana pun.";
  }
  return visible
    ? `Setelah Publish: tampil ke ${audience} sebagai ${status}.`
    : "Masih Internal: belum akan tampil ke pembaca mana pun.";
}
