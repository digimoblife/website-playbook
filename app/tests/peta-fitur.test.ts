import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, entryHistory, entrySteps, media } from "@/db/schema";
import { canView } from "@/lib/access";
import { getEditableEntry, listInbox, publishEntry, saveEntry } from "@/lib/admin-entries";
import { getEntryBySlugFor, listEntriesFor } from "@/lib/entries";
import { PETA_FITUR, seedPetaFitur } from "@/lib/peta-fitur";
import { slugify } from "@/lib/slug";
import { insertUserRow, makeTestDb, validInput } from "./helpers";

let db: AppDb;
let adminId: number;

beforeEach(() => {
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
});

describe("daftar peta fitur", () => {
  it("hanya area A sampai D; area E (superadmin) dan F (integrasi) tidak ada", () => {
    expect(new Set(PETA_FITUR.map((i) => i.area))).toEqual(new Set(["A", "B", "C", "D"]));
    const titles = PETA_FITUR.map((i) => i.title.toLowerCase()).join(" | ");
    for (const banned of ["superadmin", "webhook", "faspay", "pakasir", "telegram", "firebase", "cron", "gateway"]) {
      expect(titles, banned).not.toContain(banned);
    }
  });

  it("jenis: area C (modul add-on) = Add-on; semua area lain = Fitur inti", () => {
    for (const item of PETA_FITUR) {
      expect(item.kind, item.title).toBe(item.area === "C" ? "addon" : "core");
    }
    expect(PETA_FITUR.filter((i) => i.area === "C")).toHaveLength(6);
  });

  it("judul unik, tidak kosong, maksimal 120 karakter, dan slug-nya unik", () => {
    const titles = PETA_FITUR.map((i) => i.title);
    expect(new Set(titles).size).toBe(titles.length);
    const slugs = titles.map(slugify);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const title of titles) {
      expect(title.trim()).toBe(title);
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(120);
    }
  });

  it("mencakup butir-butir utama audit bagian 8", () => {
    const titles = PETA_FITUR.map((i) => i.title);
    for (const expected of [
      "Beranda toko", "Katalog produk", "Keranjang belanja", "Checkout", "Kupon", "Voucher",
      "Dompet dan saldo", "Kunci stok", "Peringatan stok rendah", "Domain kustom toko", "Blog Lapaq",
    ]) {
      expect(titles).toContain(expected);
    }
  });
});

describe("seedPetaFitur", () => {
  it("tanpa akun Admin: gagal dengan pesan jelas dan tidak membuat apa pun", () => {
    const empty = makeTestDb();
    expect(seedPetaFitur(empty)).toEqual({ ok: false, error: expect.stringContaining("Belum ada akun Admin") });
    expect(empty.select().from(entries).all()).toEqual([]);
  });

  it("membuat satu entri per butir, semuanya Internal, beraudiens Internal, belum terbit, tanpa isi karangan", () => {
    const r = seedPetaFitur(db);
    expect(r.ok && r.created.length).toBe(PETA_FITUR.length);
    const rows = db.select().from(entries).all();
    expect(rows).toHaveLength(PETA_FITUR.length);
    for (const row of rows) {
      expect(row, row.title).toMatchObject({
        status: "internal",
        audience: "internal",
        isPublished: false,
        archivedAt: null,
        publishedAt: null,
        nature: "new",
        summary: "",
        explanation: "",
        problem: "",
        forWhom: "",
        canPromise: "",
        cannotPromise: "",
        promoText: "",
        needsTags: "[]",
      });
    }
    expect(db.select().from(entrySteps).all()).toEqual([]);
    expect(db.select().from(media).all()).toEqual([]);
    for (const item of PETA_FITUR) {
      expect(rows.find((row) => row.slug === slugify(item.title))?.kind, item.title).toBe(item.kind);
    }
  });

  it("mencatat riwayat 'Membuat entri (peta fitur awal)' oleh Admin untuk tiap entri baru", () => {
    seedPetaFitur(db);
    const history = db.select().from(entryHistory).all();
    expect(history).toHaveLength(PETA_FITUR.length);
    expect(new Set(history.map((h) => h.summary))).toEqual(new Set(["Membuat entri (peta fitur awal)"]));
    expect(new Set(history.map((h) => h.userId))).toEqual(new Set([adminId]));
  });

  it("idempoten: menjalankan lagi tidak membuat entri atau riwayat baru", () => {
    seedPetaFitur(db);
    const before = JSON.stringify([db.select().from(entries).all(), db.select().from(entryHistory).all()]);
    const again = seedPetaFitur(db);
    expect(again).toEqual({ ok: true, created: [], skipped: PETA_FITUR.length });
    expect(JSON.stringify([db.select().from(entries).all(), db.select().from(entryHistory).all()])).toBe(before);
  });

  it("entri yang sudah disunting Admin tidak ditimpa saat seed dijalankan ulang", () => {
    seedPetaFitur(db);
    const row = db.select().from(entries).where(eq(entries.slug, "kunci-stok")).get()!;
    saveEntry(
      row.id,
      validInput({ title: "Kunci Stok", slug: "kunci-stok", kind: "addon", status: "internal", audience: "internal", summary: "Ditulis oleh Admin." }),
      adminId,
      db,
    );
    seedPetaFitur(db);
    expect(getEditableEntry(row.id, db)).toMatchObject({ summary: "Ditulis oleh Admin.", explanation: "Penjelasan uji." });
  });

  it("melengkapi yang kurang: hanya butir yang belum ada yang dibuat", () => {
    seedPetaFitur(db);
    const kupon = db.select().from(entries).where(eq(entries.slug, "kupon")).get()!;
    db.delete(entryHistory).where(eq(entryHistory.entryId, kupon.id)).run();
    db.delete(entries).where(eq(entries.slug, "kupon")).run();
    expect(seedPetaFitur(db)).toEqual({ ok: true, created: ["Kupon"], skipped: PETA_FITUR.length - 1 });
  });

  it("TIDAK ADA entri seed yang terlihat oleh Marketing atau Partner (daftar, detail, dan canView)", () => {
    seedPetaFitur(db);
    expect(listEntriesFor({ role: "marketing" }, db)).toEqual([]);
    expect(listEntriesFor({ role: "partner" }, db)).toEqual([]);
    expect(listEntriesFor({ role: "admin" }, db)).toHaveLength(PETA_FITUR.length);
    for (const row of db.select().from(entries).all()) {
      expect(getEntryBySlugFor({ role: "marketing" }, row.slug, db), row.slug).toBeNull();
      expect(getEntryBySlugFor({ role: "partner" }, row.slug, db), row.slug).toBeNull();
      expect(canView({ role: "marketing" }, row)).toBe(false);
      expect(canView({ role: "partner" }, row)).toBe(false);
      expect(canView({ role: "admin" }, row)).toBe(true);
    }
  });

  it("semua 52 entri seed muncul di Inbox sesuai urutan daftar, dan TIDAK SATU PUN punya tombol Publish", () => {
    seedPetaFitur(db);
    const inbox = listInbox(db);
    expect(inbox).toHaveLength(52);
    expect(PETA_FITUR).toHaveLength(52);
    expect(inbox.map((r) => r.title)).toEqual(PETA_FITUR.map((i) => i.title));
    expect(inbox.filter((r) => r.canPublishNow)).toEqual([]);
    expect(inbox.every((r) => r.willBeVisible === false)).toBe(true);
  });

  it("Publish untuk setiap entri seed ditolak dan tidak ada yang menjadi terbit", () => {
    seedPetaFitur(db);
    for (const row of db.select().from(entries).all()) {
      const r = publishEntry(row.id, adminId, db);
      expect(r, row.title).toEqual({ ok: false, error: expect.stringContaining("Ubah status dan audiens dari Internal dulu") });
    }
    expect(db.select().from(entries).all().filter((e) => e.isPublished)).toEqual([]);
    // tetap 52 riwayat "Membuat entri (peta fitur awal)": penolakan tidak menulis apa pun
    expect(db.select().from(entryHistory).all()).toHaveLength(52);
  });
});
