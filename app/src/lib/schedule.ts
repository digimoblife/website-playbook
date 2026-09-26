// Jadwal publish entri (Langkah 5c).
//
// Jadwal hanya bisa dipasang Admin (pemeriksaan di Server Action), dan hanya untuk entri yang
// SAAT INI lolos aturan publish yang sama dengan tombol Publish (lib/publish.ts). Saat waktunya
// tiba, publishDueEntries() memeriksa ulang aturan itu: entri bisa saja diubah setelah dijadwalkan
// (mis. status dikembalikan ke Internal). Bila tidak lolos, jadwal dibatalkan dan alasannya
// dicatat di riwayat; tidak ada yang terbit diam-diam.
//
// publishDueEntries() dipanggil setiap kali halaman website atau dashboard dibuka (lihat
// runDueSchedules), jadi tidak perlu proses latar. Skrip `npm run jadwal:jalankan` bisa dipasang
// di cron VPS bila jadwal harus tepat menit walau tidak ada yang membuka situs.
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries } from "@/db/schema";
import { loadEditable, logHistory, type EditableEntry, type Result } from "@/lib/admin-entries";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { publishBlocker } from "@/lib/publish";

const fail = (error: string) => ({ ok: false as const, error });

const MINUTE = 60 * 1000;
/** Jadwal paling jauh satu tahun ke depan, supaya salah ketik tahun tidak menyimpan jadwal "abadi". */
const MAX_AHEAD = 366 * 24 * 60 * MINUTE;

/** Mengubah masukan (string ISO atau milidetik) menjadi Date yang valid, atau null. */
export function parseScheduleTime(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function scheduleEntryPublish(
  id: number,
  at: unknown,
  actorId: number,
  db: AppDb = getDb(),
  now: Date = new Date(),
): Result<{ entry: EditableEntry; message: string }> {
  const when = parseScheduleTime(at);
  if (!when) return fail("Waktu jadwal tidak valid.");
  if (when.getTime() < now.getTime() + MINUTE) {
    return fail("Waktu jadwal harus di masa depan (minimal satu menit dari sekarang).");
  }
  if (when.getTime() > now.getTime() + MAX_AHEAD) return fail("Jadwal paling jauh satu tahun ke depan.");

  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (current.archivedAt) return fail("Entri ini diarsipkan. Pulihkan dulu sebelum menjadwalkan.");
    if (current.isPublished) return fail("Entri ini sudah terbit.");
    const blocker = publishBlocker(current, current.steps.length);
    if (blocker) return fail(blocker);

    tx.update(entries)
      .set({ scheduledPublishAt: when, scheduledBy: actorId, updatedAt: now })
      .where(eq(entries.id, id))
      .run();
    const label = formatDateTime(when);
    logHistory(tx, id, actorId, `Jadwal publish: ${label} WIB`, now);
    return {
      ok: true as const,
      entry: loadEditable(tx, id)!,
      message: `Dijadwalkan terbit ${label} WIB. Aturan publish diperiksa ulang saat waktunya tiba.`,
    };
  });
}

export function cancelEntrySchedule(
  id: number,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ entry: EditableEntry; message: string }> {
  return db.transaction((tx) => {
    const current = loadEditable(tx, id);
    if (!current) return fail("Entri tidak ditemukan.");
    if (!current.scheduledPublishAt) return fail("Entri ini tidak punya jadwal publish.");
    const now = new Date();
    tx.update(entries)
      .set({ scheduledPublishAt: null, scheduledBy: null, updatedAt: now })
      .where(eq(entries.id, id))
      .run();
    logHistory(tx, id, actorId, "Jadwal publish dibatalkan", now);
    return { ok: true as const, entry: loadEditable(tx, id)!, message: "Jadwal publish dibatalkan." };
  });
}

export type DueOutcome = { id: number; published: boolean; reason?: string };

/**
 * Menerbitkan semua entri yang jadwalnya sudah lewat. Setiap entri diproses dalam transaksinya
 * sendiri, jadi satu entri yang gagal tidak menahan yang lain. Tanggal terbit memakai waktu
 * jadwal, bukan waktu pemeriksaan, supaya urutan "Apa yang baru" sesuai rencana Admin.
 */
export function publishDueEntries(now: Date = new Date(), db: AppDb = getDb()): DueOutcome[] {
  const due = db
    .select({ id: entries.id })
    .from(entries)
    .where(and(isNotNull(entries.scheduledPublishAt), lte(entries.scheduledPublishAt, now)))
    .all();

  return due.map(({ id }) =>
    db.transaction((tx): DueOutcome => {
      const row = tx
        .select({ scheduledPublishAt: entries.scheduledPublishAt, scheduledBy: entries.scheduledBy })
        .from(entries)
        .where(eq(entries.id, id))
        .get();
      const current = loadEditable(tx, id);
      // Sudah diproses permintaan lain di antara SELECT dan transaksi ini.
      if (!row?.scheduledPublishAt || !current || row.scheduledPublishAt.getTime() > now.getTime()) {
        return { id, published: false, reason: "sudah diproses" };
      }
      const clear = { scheduledPublishAt: null, scheduledBy: null } as const;
      const actorId = row.scheduledBy;

      let reason: string | null = null;
      if (current.archivedAt) reason = "entri diarsipkan";
      else if (current.isPublished) reason = "entri sudah terbit";
      else reason = publishBlocker(current, current.steps.length);

      if (reason) {
        tx.update(entries).set(clear).where(eq(entries.id, id)).run();
        if (actorId) logHistory(tx, id, actorId, `Jadwal publish dibatalkan otomatis: ${reason}`, now);
        return { id, published: false, reason };
      }

      tx.update(entries)
        .set({ ...clear, isPublished: true, publishedAt: row.scheduledPublishAt, updatedAt: now })
        .where(eq(entries.id, id))
        .run();
      if (actorId) {
        logHistory(
          tx,
          id,
          actorId,
          `Publish terjadwal: tampil ke ${AUDIENCE_LABEL[current.audience]} sebagai ${STATUS_LABEL[current.status]}`,
          now,
        );
      }
      return { id, published: true };
    }),
  );
}

/**
 * Pemicu ringan yang dipanggil saat halaman dibuka. Galat dicatat ke log server dan tidak
 * menggagalkan halaman: jadwal yang tertunda hanya berarti entri terbit sedikit terlambat.
 */
export function runDueSchedules(db?: AppDb): void {
  try {
    publishDueEntries(new Date(), db);
  } catch (error) {
    console.error("Gagal menjalankan jadwal publish:", error);
  }
}
