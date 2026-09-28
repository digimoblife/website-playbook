// Jadwal publish (Langkah 5c): hanya entri yang lolos aturan publish yang bisa dijadwalkan, dan
// aturan itu diperiksa ULANG saat waktunya tiba. Tidak ada yang terbit diam-diam.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, entryHistory } from "@/db/schema";
import { archiveEntry, createEntry, getEditableEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { listEntriesFor } from "@/lib/entries";
import { PUBLISH_INVISIBLE_MESSAGE } from "@/lib/publish";
import { cancelEntrySchedule, publishDueEntries, scheduleEntryPublish } from "@/lib/schedule";
import { insertUserRow, makeTestDb, validInput } from "./helpers";

let db: AppDb;
let adminId: number;
const NOW = new Date("2026-10-01T02:00:00.000Z"); // 09.00 WIB
const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR);

beforeEach(() => {
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin", name: "Admin Uji" }).id;
});

function readyEntry(slug = "fitur-uji", over: Parameters<typeof validInput>[0] = {}): number {
  const r = createEntry({ title: slug, actorId: adminId }, db);
  if (!r.ok) throw new Error(r.error);
  const saved = saveEntry(r.id, validInput({ slug, ...over }), adminId, db);
  if (!saved.ok) throw new Error(saved.error);
  return r.id;
}

const history = (id: number) =>
  db.select().from(entryHistory).where(eq(entryHistory.entryId, id)).all().map((h) => h.summary);

const partner = { role: "partner" as const, active: true };

describe("Memasang jadwal", () => {
  it("entri lengkap dan terlihat pembaca bisa dijadwalkan; tercatat di riwayat dalam WIB", () => {
    const id = readyEntry();
    const r = scheduleEntryPublish(id, inHours(3).toISOString(), adminId, db, NOW);
    expect(r.ok).toBe(true);
    expect(getEditableEntry(id, db)!.scheduledPublishAt).toEqual(inHours(3));
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
    expect(history(id).at(-1)).toMatch(/^Jadwal publish: .*12\.00 WIB$/);
  });

  it("aturan publish yang sama berlaku: entri Internal dan entri tidak lengkap ditolak", () => {
    const internal = readyEntry("internal", { status: "internal" });
    expect(scheduleEntryPublish(internal, inHours(3).toISOString(), adminId, db, NOW)).toEqual({
      ok: false,
      error: PUBLISH_INVISIBLE_MESSAGE,
    });
    const incomplete = readyEntry("tak-lengkap", { steps: [] });
    const r = scheduleEntryPublish(incomplete, inHours(3).toISOString(), adminId, db, NOW);
    expect(r.ok).toBe(false);
    expect(getEditableEntry(incomplete, db)!.scheduledPublishAt).toBeNull();
  });

  it("waktu harus valid, di masa depan, dan paling jauh satu tahun", () => {
    const id = readyEntry();
    for (const at of ["bukan tanggal", null, {}, NOW.toISOString(), inHours(-1).toISOString(), inHours(24 * 400).toISOString()]) {
      expect(scheduleEntryPublish(id, at, adminId, db, NOW).ok, String(at)).toBe(false);
    }
    expect(getEditableEntry(id, db)!.scheduledPublishAt).toBeNull();
  });

  it("entri yang sudah terbit atau diarsipkan tidak bisa dijadwalkan", () => {
    const published = readyEntry("terbit");
    publishEntry(published, adminId, db);
    expect(scheduleEntryPublish(published, inHours(3).toISOString(), adminId, db, NOW).ok).toBe(false);
    const archived = readyEntry("arsip");
    archiveEntry(archived, adminId, db);
    expect(scheduleEntryPublish(archived, inHours(3).toISOString(), adminId, db, NOW).ok).toBe(false);
  });

  it("jadwal bisa dibatalkan dan pembatalannya tercatat", () => {
    const id = readyEntry();
    scheduleEntryPublish(id, inHours(3).toISOString(), adminId, db, NOW);
    expect(cancelEntrySchedule(id, adminId, db).ok).toBe(true);
    expect(getEditableEntry(id, db)!.scheduledPublishAt).toBeNull();
    expect(history(id).at(-1)).toBe("Jadwal publish dibatalkan");
    expect(cancelEntrySchedule(id, adminId, db).ok).toBe(false);
  });
});

describe("Menjalankan jadwal", () => {
  it("sebelum waktunya: tidak terjadi apa-apa dan pembaca belum melihatnya", () => {
    const id = readyEntry();
    scheduleEntryPublish(id, inHours(3).toISOString(), adminId, db, NOW);
    expect(publishDueEntries(inHours(2), db)).toEqual([]);
    expect(listEntriesFor(partner, db)).toEqual([]);
  });

  it("setelah waktunya: terbit dengan tanggal terbit = waktu jadwal, jadwal dikosongkan, tercatat", () => {
    const id = readyEntry();
    scheduleEntryPublish(id, inHours(3).toISOString(), adminId, db, NOW);
    expect(publishDueEntries(inHours(5), db)).toEqual([{ id, published: true }]);
    const entry = getEditableEntry(id, db)!;
    expect(entry).toMatchObject({ isPublished: true, scheduledPublishAt: null, publishedAt: inHours(3) });
    expect(history(id).at(-1)).toBe("Publish terjadwal: tampil ke Marketing dan Partner sebagai Beta");
    expect(listEntriesFor(partner, db).map((e) => e.id)).toEqual([id]);
    // Dijalankan lagi: tidak ada yang diproses dua kali.
    expect(publishDueEntries(inHours(6), db)).toEqual([]);
  });

  it("entri diubah menjadi Internal setelah dijadwalkan: jadwal dibatalkan otomatis, tidak terbit", () => {
    const id = readyEntry();
    scheduleEntryPublish(id, inHours(3).toISOString(), adminId, db, NOW);
    saveEntry(id, validInput({ status: "internal" }), adminId, db);
    const [outcome] = publishDueEntries(inHours(5), db);
    expect(outcome).toMatchObject({ id, published: false, reason: PUBLISH_INVISIBLE_MESSAGE });
    expect(getEditableEntry(id, db)).toMatchObject({ isPublished: false, scheduledPublishAt: null });
    expect(history(id).at(-1)).toBe(`Jadwal publish dibatalkan otomatis: ${PUBLISH_INVISIBLE_MESSAGE}`);
  });

  it("entri dikosongkan langkahnya setelah dijadwalkan: dibatalkan dengan alasan kekurangannya", () => {
    const id = readyEntry();
    scheduleEntryPublish(id, inHours(3).toISOString(), adminId, db, NOW);
    saveEntry(id, validInput({ steps: [] }), adminId, db);
    const [outcome] = publishDueEntries(inHours(5), db);
    expect(outcome.published).toBe(false);
    expect(outcome.reason).toContain("Cara pakai");
  });

  it("publish manual dan arsip membatalkan jadwal", () => {
    const manual = readyEntry("manual");
    scheduleEntryPublish(manual, inHours(3).toISOString(), adminId, db, NOW);
    publishEntry(manual, adminId, db);
    expect(getEditableEntry(manual, db)!.scheduledPublishAt).toBeNull();

    const archived = readyEntry("arsip");
    scheduleEntryPublish(archived, inHours(3).toISOString(), adminId, db, NOW);
    archiveEntry(archived, adminId, db);
    expect(getEditableEntry(archived, db)!.scheduledPublishAt).toBeNull();
    expect(history(archived).at(-1)).toBe("Diarsipkan (jadwal publish ikut dibatalkan)");
    expect(publishDueEntries(inHours(5), db)).toEqual([]);
  });

  it("satu entri bermasalah tidak menahan entri lain", () => {
    const good = readyEntry("bagus");
    const bad = readyEntry("buruk");
    scheduleEntryPublish(good, inHours(1).toISOString(), adminId, db, NOW);
    scheduleEntryPublish(bad, inHours(1).toISOString(), adminId, db, NOW);
    // Dipaksa langsung ke database: status Internal setelah dijadwalkan.
    db.update(entries).set({ status: "internal" }).where(eq(entries.id, bad)).run();
    const outcomes = publishDueEntries(inHours(2), db);
    expect(outcomes.find((o) => o.id === good)).toEqual({ id: good, published: true });
    expect(outcomes.find((o) => o.id === bad)?.published).toBe(false);
  });
});
