import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, entryHistory, entrySteps, media } from "@/db/schema";
import {
  archiveEntry,
  createEntry,
  getEditableEntry,
  listArchive,
  listEntriesAdmin,
  listEntryHistory,
  listHistory,
  listInbox,
  parseAdminFilters,
  publishEntry,
  restoreEntry,
  saveEntry,
  unpublishEntry,
} from "@/lib/admin-entries";
import { getEntryBySlugFor, listEntriesFor } from "@/lib/entries";
import { slugify } from "@/lib/slug";
import { insertUserRow, makeTestDb, snapshot, validInput } from "./helpers";

let db: AppDb;
let adminId: number;

beforeEach(() => {
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
});

function newEntry(title = "Fitur Uji"): number {
  const r = createEntry({ title, actorId: adminId }, db);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

/** Entri lengkap yang siap dipublish (Beta, Marketing dan Partner). */
function readyEntry(over = {}): number {
  const id = newEntry();
  const r = saveEntry(id, validInput(over), adminId, db);
  if (!r.ok) throw new Error(r.error);
  return id;
}

/** drizzle membungkus galat SQLite; pesan asli pemicu ada di `cause`. */
function blockedByTrigger(run: () => unknown): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught, "database seharusnya menolak").toBeDefined();
  const detail = `${(caught as Error).message} ${String((caught as { cause?: unknown }).cause ?? "")}`;
  expect(detail).toMatch(/tidak boleh terbit/);
}

const histories = (id: number) =>
  db.select().from(entryHistory).where(eq(entryHistory.entryId, id)).orderBy(entryHistory.id).all().map((h) => h.summary);

describe("slugify", () => {
  it("huruf kecil, tanpa aksen, tanda hubung tunggal", () => {
    expect(slugify("Cara Pakai Émas!!")).toBe("cara-pakai-emas");
    expect(slugify("  Retensi (kupon otomatis)  ")).toBe("retensi-kupon-otomatis");
    expect(slugify("A -- B")).toBe("a-b");
  });
  it("maksimal 80 karakter dan tidak berakhir dengan tanda hubung", () => {
    const slug = slugify(`${"kata ".repeat(40)}`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("judul tanpa huruf atau angka menjadi 'entri'", () => {
    expect(slugify("!!!")).toBe("entri");
  });
});

describe("createEntry", () => {
  it("membuat entri dengan default aman dan slug dari judul", () => {
    const id = newEntry("Kunci Stok Toko");
    const e = getEditableEntry(id, db)!;
    expect(e).toMatchObject({
      slug: "kunci-stok-toko",
      title: "Kunci Stok Toko",
      status: "internal",
      audience: "internal",
      isPublished: false,
      archivedAt: null,
      kind: "core",
      nature: "new",
      summary: "",
      steps: [],
    });
    expect(histories(id)).toEqual(["Membuat entri"]);
  });

  it("slug yang bentrok diberi akhiran -2, -3", () => {
    const a = createEntry({ title: "Fitur Sama", actorId: adminId }, db);
    const b = createEntry({ title: "Fitur Sama", actorId: adminId }, db);
    const c = createEntry({ title: "fitur   sama", actorId: adminId }, db);
    expect([a, b, c].map((r) => (r.ok ? r.slug : "gagal"))).toEqual(["fitur-sama", "fitur-sama-2", "fitur-sama-3"]);
  });

  it("menolak judul kosong atau lebih dari 120 karakter", () => {
    expect(createEntry({ title: "   ", actorId: adminId }, db)).toEqual({ ok: false, error: "Judul wajib diisi." });
    expect(createEntry({ title: 123, actorId: adminId }, db).ok).toBe(false);
    expect(createEntry({ title: "x".repeat(121), actorId: adminId }, db).ok).toBe(false);
    expect(createEntry({ title: "x".repeat(120), actorId: adminId }, db).ok).toBe(true);
  });
});

describe("saveEntry: validasi", () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["judul kosong", { title: " " }, /Judul wajib/],
    ["judul 121 karakter", { title: "x".repeat(121) }, /Judul maksimal 120/],
    ["ringkasan 201 karakter", { summary: "x".repeat(201) }, /Ringkasan maksimal 200/],
    ["masalah 3001 karakter", { problem: "x".repeat(3001) }, /Masalah yang diselesaikan maksimal 3000/],
    ["untuk toko 3001 karakter", { forWhom: "x".repeat(3001) }, /Untuk toko seperti apa maksimal 3000/],
    ["penjelasan 3001 karakter", { explanation: "x".repeat(3001) }, /Penjelasan maksimal 3000/],
    ["materi marketing 3001 karakter", { promoText: "x".repeat(3001) }, /Materi marketing maksimal 3000/],
    ["boleh dijanjikan 3001 karakter", { canPromise: "x".repeat(3001) }, /Boleh dijanjikan maksimal 3000/],
    ["jangan dijanjikan 3001 karakter", { cannotPromise: "x".repeat(3001) }, /Jangan dijanjikan maksimal 3000/],
    ["langkah 301 karakter", { steps: [{ text: "x".repeat(301), mediaId: null }] }, /Langkah 1 maksimal 300/],
    ["langkah kosong", { steps: [{ text: "  ", mediaId: null }] }, /Langkah 1 masih kosong/],
    ["13 langkah", { steps: Array.from({ length: 13 }, (_, i) => ({ text: `L${i}`, mediaId: null })) }, /Maksimal 12 langkah/],
    ["tag tidak dikenal", { needsTags: ["rahasia"] }, /Tag kebutuhan tidak dikenal/],
    ["tag bukan larik", { needsTags: "menarik-pembeli" }, /Tag kebutuhan tidak valid/],
    ["jenis asing", { kind: "modul" }, /Jenis tidak valid/],
    ["sifat asing", { nature: "lama" }, /Sifat tidak valid/],
    ["status asing", { status: "rahasia" }, /Status tidak valid/],
    ["audiens asing", { audience: "publik" }, /Audiens tidak valid/],
    ["slug huruf besar", { slug: "Slug-Salah" }, /Slug hanya boleh/],
    ["slug berawalan tanda hubung", { slug: "-abc" }, /Slug hanya boleh/],
    ["slug dua tanda hubung berurutan", { slug: "a--b" }, /Slug hanya boleh/],
    ["slug dengan spasi", { slug: "a b" }, /Slug hanya boleh/],
    ["slug 81 karakter", { slug: "a".repeat(81) }, /Slug hanya boleh/],
    ["slug dengan garis miring", { slug: "a/b" }, /Slug hanya boleh/],
    ["langkah mengacu pada gambar milik entri lain / tidak ada", { steps: [{ text: "L", mediaId: 999 }] }, /Gambar yang dipilih/],
  ];

  it.each(cases)("menolak: %s", (_name, over, message) => {
    const id = newEntry();
    const before = JSON.stringify(getEditableEntry(id, db));
    const r = saveEntry(id, validInput(over as never), adminId, db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
    expect(JSON.stringify(getEditableEntry(id, db))).toBe(before); // tidak ada yang berubah
  });

  it("menerima tepat di batas: judul 120, ringkasan 200, teks 3000, langkah 300, 12 langkah", () => {
    const id = newEntry();
    const r = saveEntry(
      id,
      validInput({
        title: "x".repeat(120),
        summary: "y".repeat(200),
        explanation: "z".repeat(3000),
        steps: Array.from({ length: 12 }, () => ({ text: "s".repeat(300), mediaId: null })),
      }),
      adminId,
      db,
    );
    expect(r.ok).toBe(true);
  });

  it("menolak masukan yang bukan objek", () => {
    const id = newEntry();
    for (const bad of [null, undefined, "teks", 42, []]) {
      expect(saveEntry(id, bad, adminId, db).ok).toBe(false);
    }
  });

  it("slug yang dipakai entri lain ditolak; slug sendiri boleh tetap", () => {
    const a = newEntry("Satu");
    const b = newEntry("Dua");
    expect(saveEntry(b, validInput({ slug: "satu" }), adminId, db)).toMatchObject({ ok: false });
    expect(saveEntry(a, validInput({ slug: "satu" }), adminId, db).ok).toBe(true);
  });

  it("entri yang tidak ada", () => {
    expect(saveEntry(9999, validInput(), adminId, db)).toEqual({ ok: false, error: "Entri tidak ditemukan." });
  });

  it("teks dirapikan: spasi ujung dibuang, ringkasan dan langkah satu baris, CRLF menjadi LF", () => {
    const id = newEntry();
    saveEntry(id, validInput({ summary: "  satu \n dua  ", explanation: "a\r\nb  ", steps: [{ text: " x \n y ", mediaId: null }] }), adminId, db);
    const e = getEditableEntry(id, db)!;
    expect(e.summary).toBe("satu dua");
    expect(e.explanation).toBe("a\nb");
    expect(e.steps[0].text).toBe("x y");
  });
});

describe("saveEntry: penyimpanan dan riwayat", () => {
  it("menyimpan semua bagian, langkah berurutan, dan tag dalam urutan baku tanpa duplikat", () => {
    const id = newEntry();
    const r = saveEntry(
      id,
      validInput({
        needsTags: ["dompet-penarikan", "menarik-pembeli", "menarik-pembeli"],
        steps: [
          { text: "Pertama", mediaId: null },
          { text: "Kedua", mediaId: null },
          { text: "Ketiga", mediaId: null },
        ],
      }),
      adminId,
      db,
    );
    expect(r.ok && r.changed).toBe(true);
    const e = getEditableEntry(id, db)!;
    expect(e.needsTags).toEqual(["menarik-pembeli", "dompet-penarikan"]);
    expect(e.steps.map((s) => s.text)).toEqual(["Pertama", "Kedua", "Ketiga"]);
    expect(e.status).toBe("beta");
    expect(e.audience).toBe("partner");
  });

  it("riwayat menyebut bagian yang berubah, dan status atau audiens punya baris sendiri", () => {
    const id = newEntry();
    // Judul dan slug sama dengan saat dibuat, jadi tidak disebut; langkah tetap kosong, jadi tidak disebut.
    saveEntry(id, validInput({ status: "internal", audience: "internal", summary: "Baru", steps: [] }), adminId, db);
    expect(histories(id)).toEqual(["Membuat entri", "Mengubah: Ringkasan, Masalah yang diselesaikan, Untuk toko seperti apa, Penjelasan, Materi marketing, Boleh dijanjikan, Jangan dijanjikan"]);
    saveEntry(id, validInput({ status: "beta", audience: "internal", summary: "Baru", steps: [] }), adminId, db);
    saveEntry(id, validInput({ status: "beta", audience: "partner", summary: "Baru", steps: [] }), adminId, db);
    expect(histories(id).slice(-2)).toEqual(["Status: Internal ke Beta", "Audiens: Internal saja ke Marketing dan Partner"]);
  });

  it("perubahan langkah, jenis, sifat, dan tag disebut", () => {
    const id = readyEntry();
    const base = validInput();
    saveEntry(id, { ...base, kind: "addon", nature: "update", needsTags: ["mengelola-stok"], steps: [{ text: "Langkah baru", mediaId: null }] }, adminId, db);
    expect(histories(id).at(-1)).toBe("Mengubah: Jenis, Sifat, Tag kebutuhan, Cara pakai");
  });

  it("menyimpan tanpa perubahan: tidak ada baris riwayat baru dan updated_at tidak berubah", () => {
    const id = readyEntry();
    const before = getEditableEntry(id, db)!;
    const count = histories(id).length;
    const r = saveEntry(id, validInput(), adminId, db);
    expect(r).toMatchObject({ ok: true, changed: false });
    expect(histories(id)).toHaveLength(count);
    expect(getEditableEntry(id, db)!.updatedAt).toEqual(before.updatedAt);
  });

  it("riwayat mencatat pengguna dan waktu", () => {
    const id = newEntry();
    const row = db.select().from(entryHistory).where(eq(entryHistory.entryId, id)).get()!;
    expect(row.userId).toBe(adminId);
    expect(Math.abs(row.at.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("langkah boleh memakai gambar milik entri ini, dan kehilangan tautan bila gambarnya dihapus (ON DELETE SET NULL)", () => {
    const id = newEntry();
    const m = db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "x.png" }).returning().get();
    expect(saveEntry(id, validInput({ steps: [{ text: "Dengan gambar", mediaId: m.id }] }), adminId, db).ok).toBe(true);
    expect(getEditableEntry(id, db)!.steps[0].mediaId).toBe(m.id);
    db.delete(media).where(eq(media.id, m.id)).run();
    expect(getEditableEntry(id, db)!.steps[0]).toEqual({ text: "Dengan gambar", mediaId: null });
  });

  it("gambar milik entri LAIN tidak boleh dipakai di langkah: ditolak dengan pesan jelas, dan database tidak berubah", () => {
    const a = newEntry("A");
    const b = newEntry("B");
    const m = db.insert(media).values({ entryId: a, kind: "screenshot", source: "manual", filePath: "x.png" }).returning().get();
    const before = snapshot(db);
    const r = saveEntry(b, validInput({ slug: "b", steps: [{ text: "L", mediaId: m.id }] }), adminId, db);
    expect(r).toEqual({ ok: false, error: "Gambar yang dipilih untuk langkah tidak ditemukan pada entri ini." });
    expect(snapshot(db)).toBe(before); // tidak ada baris yang berubah: entri B, langkahnya, dan riwayat tetap sama
  });

  it("gambar milik entri LAIN dicampur dengan gambar milik entri sendiri: seluruh penyimpanan ditolak (bukan sebagian)", () => {
    const a = newEntry("A");
    const b = newEntry("B");
    const foreign = db.insert(media).values({ entryId: a, kind: "screenshot", source: "manual", filePath: "asing.png" }).returning().get();
    const own = db.insert(media).values({ entryId: b, kind: "screenshot", source: "manual", filePath: "sendiri.png" }).returning().get();
    const before = snapshot(db);
    const r = saveEntry(
      b,
      validInput({
        slug: "b",
        steps: [
          { text: "Langkah dengan gambar sendiri", mediaId: own.id },
          { text: "Langkah dengan gambar asing", mediaId: foreign.id },
        ],
      }),
      adminId,
      db,
    );
    expect(r).toMatchObject({ ok: false });
    expect(snapshot(db)).toBe(before);
  });

  it("gambar milik entri yang SAMA diterima: satu langkah, beberapa langkah, dan gambar yang sama dipakai ulang di dua langkah", () => {
    const id = newEntry();
    const m1 = db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "a.png" }).returning().get();
    const m2 = db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "b.png" }).returning().get();

    const r1 = saveEntry(id, validInput({ steps: [{ text: "Satu gambar", mediaId: m1.id }] }), adminId, db);
    expect(r1).toMatchObject({ ok: true, changed: true });
    expect(getEditableEntry(id, db)!.steps).toEqual([{ text: "Satu gambar", mediaId: m1.id }]);

    const r2 = saveEntry(
      id,
      validInput({
        steps: [
          { text: "Langkah pertama", mediaId: m1.id },
          { text: "Langkah kedua", mediaId: m2.id },
          { text: "Langkah ketiga, gambar dipakai ulang", mediaId: m1.id },
        ],
      }),
      adminId,
      db,
    );
    expect(r2).toMatchObject({ ok: true, changed: true });
    expect(getEditableEntry(id, db)!.steps).toEqual([
      { text: "Langkah pertama", mediaId: m1.id },
      { text: "Langkah kedua", mediaId: m2.id },
      { text: "Langkah ketiga, gambar dipakai ulang", mediaId: m1.id },
    ]);
  });

  it("entri lain yang punya gambar bernomor id sama persis (kebetulan) tetap tidak boleh saling meminjam", () => {
    // Dua entri, masing-masing punya satu gambar; gambar entri A tidak boleh dipakai entri B
    // walau keduanya berstatus dan berisi identik selain gambarnya.
    const a = newEntry("Kembar A");
    const b = newEntry("Kembar B");
    const mA = db.insert(media).values({ entryId: a, kind: "screenshot", source: "manual", filePath: "a.png" }).returning().get();
    db.insert(media).values({ entryId: b, kind: "screenshot", source: "manual", filePath: "b.png" }).returning().get();
    const before = snapshot(db);
    expect(saveEntry(b, validInput({ slug: "kembar-b", steps: [{ text: "Pinjam gambar A", mediaId: mA.id }] }), adminId, db)).toMatchObject({ ok: false });
    expect(snapshot(db)).toBe(before);
  });
});

describe("aturan publish", () => {
  const rejected = (id: number) => publishEntry(id, adminId, db);

  it("Ringkasan kosong: ditolak dan pesan menyebut Ringkasan saja", () => {
    const id = readyEntry({ summary: "" });
    const r = rejected(id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Ringkasan");
      expect(r.error).not.toMatch(/Cara pakai|Boleh dijanjikan|Jangan dijanjikan/);
    }
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
  });

  it("tanpa satu pun langkah: ditolak dan pesan menyebut Cara pakai saja", () => {
    const id = readyEntry({ steps: [] });
    const r = rejected(id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Cara pakai (minimal satu langkah)");
      expect(r.error).not.toMatch(/Ringkasan|Boleh dijanjikan|Jangan dijanjikan/);
    }
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
  });

  it("Boleh dijanjikan kosong: ditolak dan pesan menyebut itu saja", () => {
    const id = readyEntry({ canPromise: "" });
    const r = rejected(id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Boleh dijanjikan");
      expect(r.error).not.toMatch(/Ringkasan|Cara pakai|Jangan dijanjikan/);
    }
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
  });

  it("Jangan dijanjikan kosong: ditolak dan pesan menyebut itu saja", () => {
    const id = readyEntry({ cannotPromise: "" });
    const r = rejected(id);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Jangan dijanjikan");
      expect(r.error).not.toMatch(/Ringkasan|Cara pakai|Boleh dijanjikan/);
    }
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
  });

  it("beberapa yang kurang: semuanya disebut", () => {
    const id = readyEntry({ summary: "", steps: [], canPromise: "", cannotPromise: "" });
    const r = rejected(id);
    expect(!r.ok && r.error).toMatch(/Ringkasan, Cara pakai \(minimal satu langkah\), Boleh dijanjikan, Jangan dijanjikan/);
  });

  const INVISIBLE_MESSAGE =
    "Ubah status dan audiens dari Internal dulu, baru Publish. Untuk menyimpan tanpa menampilkan, pakai Simpan.";

  it("entri baru (Internal, Internal, kosong): Publish ditolak dengan pesan itu dan tidak ada yang berubah", () => {
    const id = newEntry();
    const before = JSON.stringify(getEditableEntry(id, db));
    const historyBefore = histories(id);
    expect(publishEntry(id, adminId, db)).toEqual({ ok: false, error: INVISIBLE_MESSAGE });
    expect(JSON.stringify(getEditableEntry(id, db))).toBe(before);
    expect(histories(id)).toEqual(historyBefore);
    expect(getEditableEntry(id, db)).toMatchObject({ isPublished: false, publishedAt: null });
  });

  it.each([
    ["internal", "internal"],
    ["internal", "marketing"],
    ["internal", "partner"],
    ["beta", "internal"],
    ["siap", "internal"],
  ] as const)("status %s + audiens %s: Publish ditolak walau isinya lengkap", (status, audience) => {
    const id = readyEntry({ status, audience });
    expect(publishEntry(id, adminId, db)).toEqual({ ok: false, error: INVISIBLE_MESSAGE });
    expect(getEditableEntry(id, db)).toMatchObject({ isPublished: false, publishedAt: null });
    expect(histories(id).some((h) => h.startsWith("Publish"))).toBe(false);
  });

  it("matriks status x audiens (lengkap): Publish berhasil HANYA bila entri akan terlihat pembaca", () => {
    // Ditulis tangan: 4 dari 9 kombinasi (status beta/siap x audiens marketing/partner) yang boleh.
    const allowed = new Set(["beta|marketing", "beta|partner", "siap|marketing", "siap|partner"]);
    let succeeded = 0;
    for (const status of ["internal", "beta", "siap"] as const) {
      for (const audience of ["internal", "marketing", "partner"] as const) {
        const created = createEntry({ title: `Kombinasi ${status} ${audience}`, actorId: adminId }, db);
        if (!created.ok) throw new Error();
        saveEntry(created.id, validInput({ title: `Kombinasi ${status} ${audience}`, slug: `k-${status}-${audience}`, status, audience }), adminId, db);
        const r = publishEntry(created.id, adminId, db);
        const expected = allowed.has(`${status}|${audience}`);
        expect(r.ok, `${status} + ${audience}`).toBe(expected);
        expect(getEditableEntry(created.id, db)!.isPublished, `${status} + ${audience}`).toBe(expected);
        if (r.ok) succeeded += 1;
      }
    }
    expect(succeeded).toBe(4);
  });

  it("Publish tidak pernah menghasilkan entri terbit yang tak terlihat pembaca", () => {
    const a = newEntry("A");
    const b = newEntry("B");
    saveEntry(a, validInput({ title: "A", slug: "a", status: "internal", audience: "partner" }), adminId, db);
    saveEntry(b, validInput({ title: "B", slug: "b", status: "beta", audience: "marketing" }), adminId, db);
    for (const id of [a, b]) publishEntry(id, adminId, db);
    const published = db.select().from(entries).all().filter((e) => e.isPublished);
    expect(published.map((e) => e.slug)).toEqual(["b"]);
    expect(listEntriesFor({ role: "marketing" }, db).map((e) => e.slug)).toEqual(["b"]);
  });

  it("entri lengkap: terbit, published_at terisi, riwayat mencatat, dan terlihat oleh pembaca yang tepat", () => {
    const id = readyEntry({ status: "beta", audience: "marketing" });
    const r = publishEntry(id, adminId, db);
    expect(r.ok && r.message).toBe("Diterbitkan. Tampil ke Marketing sebagai Beta.");
    const e = getEditableEntry(id, db)!;
    expect(e.isPublished).toBe(true);
    expect(e.publishedAt).toBeInstanceOf(Date);
    expect(histories(id).at(-1)).toBe("Publish: tampil ke Marketing sebagai Beta");
    expect(getEntryBySlugFor({ role: "marketing" }, "fitur-uji", db)).not.toBeNull();
    expect(getEntryBySlugFor({ role: "partner" }, "fitur-uji", db)).toBeNull(); // audiens Marketing saja
  });

  it("publish dua kali ditolak", () => {
    const id = readyEntry();
    publishEntry(id, adminId, db);
    expect(publishEntry(id, adminId, db)).toEqual({ ok: false, error: "Entri ini sudah terbit." });
  });

  it("entri tidak ada", () => {
    expect(publishEntry(9999, adminId, db)).toEqual({ ok: false, error: "Entri tidak ditemukan." });
  });
});

describe("tarik kembali", () => {
  it("menarik entri terbit dari pembaca dan mencatat riwayat", () => {
    const id = readyEntry();
    publishEntry(id, adminId, db);
    expect(getEntryBySlugFor({ role: "partner" }, "fitur-uji", db)).not.toBeNull();
    const r = unpublishEntry(id, adminId, db);
    expect(r.ok).toBe(true);
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
    expect(getEntryBySlugFor({ role: "partner" }, "fitur-uji", db)).toBeNull();
    expect(histories(id).at(-1)).toBe("Tarik kembali: tidak lagi tampil ke pembaca");
  });

  it("menarik entri yang belum terbit ditolak", () => {
    expect(unpublishEntry(readyEntry(), adminId, db)).toEqual({ ok: false, error: "Entri ini belum terbit." });
  });
});

describe("mengubah status atau audiens pada entri terbit", () => {
  it("tidak menariknya kembali, tetapi mengubah siapa yang melihatnya", () => {
    const id = readyEntry();
    publishEntry(id, adminId, db);
    saveEntry(id, validInput({ status: "internal" }), adminId, db);
    expect(getEditableEntry(id, db)!.isPublished).toBe(true); // tetap terbit
    expect(getEntryBySlugFor({ role: "partner" }, "fitur-uji", db)).toBeNull(); // tapi tak terlihat lagi
    saveEntry(id, validInput({ status: "siap", audience: "marketing" }), adminId, db);
    expect(getEditableEntry(id, db)!.isPublished).toBe(true);
    expect(getEntryBySlugFor({ role: "marketing" }, "fitur-uji", db)).not.toBeNull();
    expect(getEntryBySlugFor({ role: "partner" }, "fitur-uji", db)).toBeNull();
  });
});

describe("arsip dan pulihkan", () => {
  it("mengarsipkan entri terbit: terarsip, tidak terbit, tidak terlihat pembaca, riwayat mencatat", () => {
    const id = readyEntry();
    publishEntry(id, adminId, db);
    const r = archiveEntry(id, adminId, db);
    expect(r.ok).toBe(true);
    const e = getEditableEntry(id, db)!;
    expect(e.archivedAt).toBeInstanceOf(Date);
    expect(e.isPublished).toBe(false);
    expect(listEntriesFor({ role: "partner" }, db)).toEqual([]);
    expect(listEntriesFor({ role: "marketing" }, db)).toEqual([]);
    expect(listEntriesFor({ role: "admin" }, db)).toHaveLength(1);
    expect(histories(id).at(-1)).toBe("Diarsipkan (sebelumnya terbit; otomatis ditarik dari pembaca)");
  });

  it("mengarsipkan dua kali ditolak", () => {
    const id = newEntry();
    archiveEntry(id, adminId, db);
    expect(archiveEntry(id, adminId, db)).toEqual({ ok: false, error: "Entri ini sudah diarsipkan." });
  });

  it("entri terarsip tidak bisa dipublish, tidak bisa disunting, dan tidak bisa ditarik", () => {
    const id = readyEntry();
    archiveEntry(id, adminId, db);
    expect(publishEntry(id, adminId, db)).toMatchObject({ ok: false, error: expect.stringContaining("diarsipkan") });
    expect(saveEntry(id, validInput({ title: "Ganti" }), adminId, db)).toMatchObject({ ok: false, error: expect.stringContaining("diarsipkan") });
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
    expect(getEditableEntry(id, db)!.title).not.toBe("Ganti");
  });

  it("memulihkan: kembali ke Inbox sebagai draf, tidak otomatis terbit", () => {
    const id = readyEntry();
    publishEntry(id, adminId, db);
    archiveEntry(id, adminId, db);
    expect(listInbox(db).map((r) => r.id)).not.toContain(id);
    const r = restoreEntry(id, adminId, db);
    expect(r.ok).toBe(true);
    const e = getEditableEntry(id, db)!;
    expect(e.archivedAt).toBeNull();
    expect(e.isPublished).toBe(false);
    expect(listInbox(db).map((row) => row.id)).toContain(id);
    expect(histories(id).at(-1)).toBe("Dipulihkan dari arsip (kembali ke Inbox sebagai draf)");
  });

  it("memulihkan entri yang tidak diarsipkan ditolak", () => {
    expect(restoreEntry(newEntry(), adminId, db)).toEqual({ ok: false, error: "Entri ini tidak sedang diarsipkan." });
  });
});

describe("pemicu database: entri terarsip tidak pernah terbit (dijaga di lapisan data)", () => {
  it("UPDATE yang membuat entri terarsip menjadi terbit ditolak database", () => {
    const id = newEntry();
    archiveEntry(id, adminId, db);
    blockedByTrigger(() => db.run(sql`update entries set is_published = 1 where id = ${id}`));
    expect(getEditableEntry(id, db)!.isPublished).toBe(false);
  });

  it("UPDATE yang mengarsipkan sekaligus menerbitkan ditolak", () => {
    const id = newEntry();
    blockedByTrigger(() => db.run(sql`update entries set archived_at = 1, is_published = 1 where id = ${id}`));
  });

  it("INSERT entri terarsip yang terbit ditolak", () => {
    blockedByTrigger(() =>
      db.run(sql`insert into entries (slug, title, archived_at, is_published) values ('x', 'x', 1, 1)`),
    );
  });

  it("arsip dan pulihkan lewat fungsi biasa tetap berjalan (pemicu tidak menghalangi jalur sah)", () => {
    const id = readyEntry();
    publishEntry(id, adminId, db);
    expect(archiveEntry(id, adminId, db).ok).toBe(true);
    expect(restoreEntry(id, adminId, db).ok).toBe(true);
    expect(publishEntry(id, adminId, db).ok).toBe(true);
  });

  it("lapis kedua: bila pemicu dihapus dan datanya rusak, lapisan baca tetap tidak menampilkannya ke pembaca", () => {
    const id = readyEntry();
    db.run(sql`drop trigger entries_arsip_tidak_terbit_update`);
    db.run(sql`update entries set archived_at = 1, is_published = 1 where id = ${id}`);
    expect(getEditableEntry(id, db)).toMatchObject({ isPublished: true });
    expect(listEntriesFor({ role: "marketing" }, db)).toEqual([]);
    expect(listEntriesFor({ role: "partner" }, db)).toEqual([]);
    expect(getEntryBySlugFor({ role: "partner" }, "fitur-uji", db)).toBeNull();
    expect(listEntriesFor({ role: "admin" }, db)).toHaveLength(1);
  });
});

describe("daftar dan filter", () => {
  function seedMany() {
    const mk = (title: string, over: Record<string, unknown> = {}, publish = false) => {
      const id = newEntry(title);
      saveEntry(id, validInput({ title, slug: slugify(title), ...over } as never), adminId, db);
      if (publish) publishEntry(id, adminId, db);
      return id;
    };
    return {
      a: mk("Kunci Stok", { kind: "addon", status: "siap", audience: "partner" }, true),
      b: mk("Beranda Toko", { kind: "core", status: "beta", audience: "marketing" }),
      c: mk("Diskon 50% dan_garis", { kind: "core", status: "internal", audience: "internal" }),
      d: mk("Arsip Lama", {}),
    };
  }

  it("Inbox: entri yang belum terlihat pembaca dan belum diarsipkan, terbaru di atas", () => {
    const ids = seedMany();
    archiveEntry(ids.d, adminId, db);
    const inbox = listInbox(db);
    // a: terbit dan terlihat (Siap, Marketing dan Partner) -> keluar dari Inbox; d: terarsip -> keluar.
    expect(inbox.map((r) => r.id).sort()).toEqual([ids.b, ids.c].sort());
    const times = inbox.map((r) => r.updatedAt.getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it("Inbox: tombol Publish (canPublishNow) hanya untuk entri yang akan terlihat pembaca DAN lengkap", () => {
    const ids = seedMany();
    const row = (id: number) => listInbox(db).find((r) => r.id === id)!;
    // b: Beta, Marketing, lengkap -> boleh
    expect(row(ids.b)).toMatchObject({ willBeVisible: true, missing: [], canPublishNow: true });
    // c: Internal, Internal -> tidak boleh, dan bukan karena "kurang"
    expect(row(ids.c)).toMatchObject({ willBeVisible: false, missing: [], canPublishNow: false });
    // b tanpa ringkasan -> akan terlihat tetapi kurang
    saveEntry(ids.b, validInput({ title: "Beranda Toko", slug: "beranda-toko", status: "beta", audience: "marketing", summary: "" }), adminId, db);
    expect(row(ids.b)).toMatchObject({ willBeVisible: true, canPublishNow: false, missing: ["Ringkasan"] });
  });

  it("Inbox ditentukan oleh keterlihatan, bukan sekadar is_published: entri terbit yang tak terlihat masuk Inbox tanpa tombol Publish", () => {
    const id = readyEntry({ status: "beta", audience: "partner" });
    publishEntry(id, adminId, db);
    expect(listInbox(db).map((r) => r.id)).not.toContain(id); // terbit dan terlihat -> tidak di Inbox
    saveEntry(id, validInput({ status: "internal", audience: "partner" }), adminId, db); // tetap terbit, tetapi tak terlihat
    expect(getEditableEntry(id, db)!.isPublished).toBe(true);
    expect(listEntriesFor({ role: "partner" }, db)).toEqual([]);
    expect(listInbox(db).find((r) => r.id === id)).toMatchObject({ isPublished: true, willBeVisible: false, canPublishNow: false });
    saveEntry(id, validInput({ status: "beta", audience: "internal" }), adminId, db);
    expect(listInbox(db).map((r) => r.id)).toContain(id);
    saveEntry(id, validInput({ status: "siap", audience: "partner" }), adminId, db); // terlihat lagi
    expect(listInbox(db).map((r) => r.id)).not.toContain(id);
  });

  it("Inbox tidak memuat entri terarsip walau tak terlihat pembaca", () => {
    const id = newEntry("Akan diarsipkan");
    expect(listInbox(db).map((r) => r.id)).toContain(id);
    archiveEntry(id, adminId, db);
    expect(listInbox(db).map((r) => r.id)).not.toContain(id);
  });

  it("Arsip: hanya entri terarsip", () => {
    const ids = seedMany();
    archiveEntry(ids.a, adminId, db);
    expect(listArchive(db).map((r) => r.id)).toEqual([ids.a]);
  });

  it("Semua entri: filter status, audiens, jenis, terbit, dan pencarian judul", () => {
    const ids = seedMany();
    const q = (f: Parameters<typeof listEntriesAdmin>[0]) => listEntriesAdmin(f, db).map((r) => r.id).sort();
    expect(q({})).toHaveLength(4);
    expect(q({ status: "siap" })).toEqual([ids.a]);
    expect(q({ audience: "marketing" })).toEqual([ids.b]);
    expect(q({ kind: "addon" })).toEqual([ids.a]);
    expect(q({ published: "ya" })).toEqual([ids.a]);
    expect(q({ published: "tidak" })).toEqual([ids.b, ids.c, ids.d].sort());
    expect(q({ q: "stok" })).toEqual([ids.a]);
    expect(q({ q: "STOK" })).toEqual([ids.a]); // tidak peka huruf besar
    expect(q({ status: "beta", audience: "marketing", kind: "core", published: "tidak", q: "beranda" })).toEqual([ids.b]);
    expect(q({ q: "tidak-ada" })).toEqual([]);
  });

  it("pencarian memperlakukan % dan _ sebagai huruf biasa, bukan pola", () => {
    const ids = seedMany();
    const q = (text: string) => listEntriesAdmin({ q: text }, db).map((r) => r.id);
    expect(q("50% dan")).toEqual([ids.c]); // tanda persen dicocokkan harfiah
    expect(q("%")).toEqual([ids.c]); // hanya judul yang memuat tanda persen (bukan "semua")
    expect(q("_")).toEqual([ids.c]); // hanya judul yang memuat garis bawah
    expect(q("n_g")).toEqual([ids.c]); // "dan_garis" memuat "n_g" harfiah
    // Bila _ dan % dianggap pola, ketiga pencarian ini akan cocok dengan entri lain:
    expect(q("50_ dan")).toEqual([]); // "_" bukan pengganti satu huruf ("50% dan" tidak boleh cocok)
    expect(q("d_n")).toEqual([]); // "_" bukan pengganti satu huruf ("dan" tidak boleh cocok)
    expect(q("k%k")).toEqual([]); // "%" bukan pengganti bebas ("Kunci Stok" tidak boleh cocok)
  });

  it("Semua entri memuat entri terarsip juga", () => {
    const ids = seedMany();
    archiveEntry(ids.d, adminId, db);
    expect(listEntriesAdmin({}, db).map((r) => r.id)).toContain(ids.d);
  });

  it("parseAdminFilters mengabaikan nilai asing", () => {
    expect(parseAdminFilters({ status: "rahasia", audiens: "publik", jenis: "x", terbit: "mungkin", q: "  abc  " })).toEqual({
      status: undefined, audience: undefined, kind: undefined, published: undefined, q: "abc",
    });
    expect(parseAdminFilters({ status: "beta", audiens: "partner", jenis: "addon", terbit: "ya" })).toMatchObject({
      status: "beta", audience: "partner", kind: "addon", published: "ya",
    });
  });
});

describe("riwayat lintas entri", () => {
  it("50 per halaman, terbaru di atas, bisa difilter per entri", () => {
    const a = newEntry("A");
    const b = newEntry("B");
    for (let i = 0; i < 60; i++) {
      db.insert(entryHistory).values({ entryId: a, userId: adminId, summary: `ubah ${i}`, at: new Date(Date.now() + i * 1000) }).run();
    }
    const p1 = listHistory({ page: 1 }, db);
    expect(p1.total).toBe(62); // 60 + 2 "Membuat entri"
    expect(p1.pages).toBe(2);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows[0].summary).toBe("ubah 59");
    const p2 = listHistory({ page: 2 }, db);
    expect(p2.rows).toHaveLength(12);
    expect(listHistory({ page: 99 }, db).page).toBe(2); // dibatasi ke halaman terakhir
    expect(listHistory({ page: -3 }, db).page).toBe(1);
    const onlyB = listHistory({ entryId: b }, db);
    expect(onlyB.total).toBe(1);
    expect(onlyB.rows[0]).toMatchObject({ entryId: b, entryTitle: "B", userName: "Pengguna Tes", summary: "Membuat entri" });
    expect(listEntryHistory(a, 5, db)).toHaveLength(5);
  });
});

describe("entri tidak pernah dihapus", () => {
  it("tidak ada fungsi penghapusan entri di lapisan data admin", async () => {
    const mod = await import("@/lib/admin-entries");
    expect(Object.keys(mod).filter((k) => /delete|hapus|remove/i.test(k))).toEqual([]);
  });

  it("langkah dan riwayat ikut tersimpan selama entri ada", () => {
    const id = readyEntry();
    expect(db.select().from(entrySteps).where(eq(entrySteps.entryId, id)).all()).toHaveLength(1);
    archiveEntry(id, adminId, db);
    expect(db.select().from(entries).where(eq(entries.id, id)).all()).toHaveLength(1);
    expect(db.select().from(entrySteps).where(eq(entrySteps.entryId, id)).all()).toHaveLength(1);
  });
});
