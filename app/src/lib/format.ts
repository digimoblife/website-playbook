const formatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

/** Apakah tanggal ini jatuh dalam `days` hari terakhir (dipakai "Baru minggu ini" di beranda). */
export function isWithinLastDays(date: Date | null, days: number, now: number = Date.now()): boolean {
  return date !== null && date.getTime() >= now - days * 24 * 60 * 60 * 1000;
}

export function formatDateTime(date: Date | null): string {
  return date ? formatter.format(date) : "Belum pernah";
}
