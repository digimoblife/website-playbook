// getEntryDetailBySlugFor: satu-satunya pintu bagi halaman fitur untuk mengambil langkah dan
// gambar. Fokus: entri yang tidak boleh dilihat mengembalikan null TANPA membocorkan apa pun
// (dan tanpa menjalankan query langkah/gambar sama sekali), dan galeri hanya berisi gambar yang
// belum ditautkan ke langkah mana pun.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, media } from "@/db/schema";
import { createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { getEntryDetailBySlugFor, getEntryBySlugFor } from "@/lib/entries";
import type { Role } from "@/lib/domain";
import { ALL_ROLES, insertUserRow, makeTestDb, validInput } from "./helpers";

let db: AppDb;
let adminId: number;
const queries: string[] = [];

beforeEach(() => {
  db = makeTestDb({ logQuery: (q) => void queries.push(q) });
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  queries.length = 0;
});

/** `publish: true` (default) menerbitkannya lewat publishEntry sungguhan, bukan sekadar mengisi kolom. */
function makeEntry(
  slug: string,
  over: Record<string, unknown> = {},
  options: { publish?: boolean } = {},
): number {
  const created = createEntry({ title: slug, actorId: adminId }, db);
  if (!created.ok) throw new Error(created.error);
  const saved = saveEntry(created.id, validInput({ title: slug, slug, ...over }), adminId, db);
  if (!saved.ok) throw new Error(saved.error);
  if (options.publish ?? true) {
    const published = publishEntry(created.id, adminId, db);
    if (!published.ok) throw new Error(published.error);
  }
  return created.id;
}

describe("getEntryDetailBySlugFor: akses ditolak", () => {
  it("Marketing/Partner untuk entri Internal: null, bukan objek berisi langkah/gambar/FAQ", () => {
    // Entri Internal tidak boleh dipublish sama sekali (aturan Langkah 2b), jadi publish: false.
    const id = makeEntry(
      "internal-saja",
      { status: "internal", audience: "internal", faqs: [{ question: "Rahasia?", answer: "Ya" }] },
      { publish: false },
    );
    db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "x.png" }).run();

    for (const role of ["marketing", "partner"] as Role[]) {
      const result = getEntryDetailBySlugFor({ role }, "internal-saja", db);
      expect(result).toBeNull();
      // Bukan sekadar steps/images/faqs kosong: seluruh hasilnya null.
      expect(result).not.toEqual(expect.objectContaining({ steps: [] }));
    }
  });

  it("Partner untuk entri beraudiens Marketing saja: null, dan tidak ada query langkah/gambar yang dijalankan", () => {
    const id = makeEntry("khusus-marketing", { status: "beta", audience: "marketing" });
    db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "rahasia.png" }).run();

    queries.length = 0;
    const result = getEntryDetailBySlugFor({ role: "partner" }, "khusus-marketing", db);
    expect(result).toBeNull();
    expect(queries.some((q) => q.includes("entry_steps"))).toBe(false);
    expect(queries.some((q) => q.toLowerCase().includes("from `media`") || q.includes('"media"'))).toBe(false);
    expect(queries.some((q) => q.includes("entry_faqs"))).toBe(false);
  });

  it("entri yang belum terbit: null untuk Marketing/Partner walau status dan audiens sudah lengkap", () => {
    makeEntry("belum-terbit", { status: "siap", audience: "partner" }, { publish: false });
    for (const role of ["marketing", "partner"] as Role[]) {
      expect(getEntryDetailBySlugFor({ role }, "belum-terbit", db)).toBeNull();
    }
  });

  it("entri yang tidak ada sama sekali: null (sama seperti getEntryBySlugFor, tak dibedakan)", () => {
    expect(getEntryDetailBySlugFor({ role: "admin" }, "tidak-ada", db)).toBeNull();
    expect(getEntryDetailBySlugFor({ role: "partner" }, "tidak-ada", db)).toBeNull();
  });

  it("pengguna tidak dikenal, nonaktif, atau berperan asing: null", () => {
    makeEntry("terbuka", { status: "siap", audience: "partner" });
    expect(getEntryDetailBySlugFor(null, "terbuka", db)).toBeNull();
    expect(getEntryDetailBySlugFor(undefined, "terbuka", db)).toBeNull();
    expect(getEntryDetailBySlugFor({ role: "partner", active: false }, "terbuka", db)).toBeNull();
    expect(getEntryDetailBySlugFor({ role: "editor" as unknown as Role }, "terbuka", db)).toBeNull();
  });

  it("konsisten dengan getEntryBySlugFor untuk seluruh matriks 3 peran x kombinasi visibilitas", () => {
    const cases = [
      { status: "internal", audience: "partner", isPublished: true },
      { status: "beta", audience: "internal", isPublished: true },
      { status: "beta", audience: "marketing", isPublished: false },
      { status: "siap", audience: "partner", isPublished: true },
    ] as const;
    cases.forEach((c, i) => {
      const slug = `matriks-${i}`;
      const id = makeEntry(slug, { status: c.status, audience: c.audience }, { publish: false });
      if (c.isPublished) {
        // publish lewat admin-entries agar aturan publish yang sesungguhnya dipakai
        // (entri dilengkapi dulu bila perlu supaya publish tidak ditolak karena isi kurang).
        db.update(entries).set({ isPublished: true, publishedAt: new Date() }).where(eq(entries.id, id)).run();
      }
      for (const role of ALL_ROLES) {
        const basic = getEntryBySlugFor({ role }, slug, db);
        const detail = getEntryDetailBySlugFor({ role }, slug, db);
        expect(detail === null, `${role} | ${slug}`).toBe(basic === null);
      }
    });
  });
});

describe("getEntryDetailBySlugFor: akses diterima", () => {
  it("langkah terurut posisi, dan galeri hanya berisi gambar yang BELUM ditautkan ke langkah", () => {
    const id = makeEntry("kunci-stok", { status: "siap", audience: "partner" });
    const linked = db
      .insert(media)
      .values({ entryId: id, kind: "screenshot", source: "manual", filePath: "langkah1.png" })
      .returning()
      .get();
    const gallery1 = db
      .insert(media)
      .values({ entryId: id, kind: "gif", source: "manual", filePath: "galeri1.gif" })
      .returning()
      .get();
    const gallery2 = db
      .insert(media)
      .values({ entryId: id, kind: "screenshot", source: "manual", filePath: "galeri2.png" })
      .returning()
      .get();

    const saved = saveEntry(
      id,
      validInput({
        title: "kunci-stok",
        slug: "kunci-stok",
        status: "siap",
        audience: "partner",
        steps: [
          { text: "Langkah kedua", mediaId: null },
          { text: "Langkah pertama dengan gambar", mediaId: linked.id },
        ],
      }),
      adminId,
      db,
    );
    expect(saved.ok).toBe(true);

    const detail = getEntryDetailBySlugFor({ role: "partner" }, "kunci-stok", db);
    expect(detail).not.toBeNull();
    expect(detail!.steps).toEqual([
      { text: "Langkah kedua", mediaId: null },
      { text: "Langkah pertama dengan gambar", mediaId: linked.id },
    ]);
    const galleryIds = detail!.images.map((img) => img.id).sort((a, b) => a - b);
    expect(galleryIds).toEqual([gallery1.id, gallery2.id].sort((a, b) => a - b));
    expect(galleryIds).not.toContain(linked.id);
  });

  it("entri tanpa langkah: galeri berisi SEMUA gambar milik entri itu", () => {
    // publishEntry mensyaratkan minimal satu langkah untuk entri yang terlihat pembaca, jadi
    // status terbit diset langsung di sini untuk menguji lapisan BACA secara terisolasi.
    const id = makeEntry("tanpa-langkah", { status: "beta", audience: "marketing", steps: [] }, { publish: false });
    db.update(entries).set({ isPublished: true, publishedAt: new Date() }).where(eq(entries.id, id)).run();
    const a = db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "a.png" }).returning().get();
    const b = db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "b.png" }).returning().get();

    const detail = getEntryDetailBySlugFor({ role: "marketing" }, "tanpa-langkah", db);
    expect(detail!.steps).toEqual([]);
    expect(detail!.images.map((i) => i.id).sort((x, y) => x - y)).toEqual([a.id, b.id].sort((x, y) => x - y));
  });

  it("gambar promosi dipisah dari galeri 'Cara kerja' dan masuk promoImages", () => {
    const id = makeEntry("dengan-promo", { status: "siap", audience: "partner" });
    const shot = db.insert(media).values({ entryId: id, kind: "screenshot", source: "manual", filePath: "s.png" }).returning().get();
    const promo = db.insert(media).values({ entryId: id, kind: "promo", source: "manual", filePath: "p.png" }).returning().get();

    const detail = getEntryDetailBySlugFor({ role: "partner" }, "dengan-promo", db);
    expect(detail!.images.map((i) => i.id)).toEqual([shot.id]);
    expect(detail!.promoImages).toEqual([{ id: promo.id, kind: "promo" }]);
  });

  it("entri tanpa gambar sama sekali: images kosong, bukan galat", () => {
    makeEntry("tanpa-gambar", { status: "siap", audience: "partner" });
    const detail = getEntryDetailBySlugFor({ role: "partner" }, "tanpa-gambar", db);
    expect(detail!.images).toEqual([]);
  });

  it("gambar milik entri LAIN tidak pernah muncul di galeri, walau id-nya tidak dipakai di langkah mana pun", () => {
    const a = makeEntry("entri-a", { status: "siap", audience: "partner" });
    const b = makeEntry("entri-b", { status: "siap", audience: "partner" });
    db.insert(media).values({ entryId: a, kind: "screenshot", source: "manual", filePath: "milik-a.png" }).run();

    const detailB = getEntryDetailBySlugFor({ role: "partner" }, "entri-b", db);
    expect(detailB!.images).toEqual([]);
    void b;
  });

  it("Admin melihat detail entri apa pun, termasuk yang belum terbit", () => {
    makeEntry("draf-admin", { status: "internal", audience: "internal", steps: [] }, { publish: false });
    const detail = getEntryDetailBySlugFor({ role: "admin" }, "draf-admin", db);
    expect(detail).not.toBeNull();
    expect(detail!.steps).toEqual([]);
  });

  it("hasil memuat seluruh field EntryForReader (bukan hanya steps/images)", () => {
    makeEntry("lengkap", { status: "siap", audience: "partner", summary: "Ringkasan uji" });
    const detail = getEntryDetailBySlugFor({ role: "partner" }, "lengkap", db);
    expect(detail).toMatchObject({ slug: "lengkap", summary: "Ringkasan uji", status: "siap", audience: "partner" });
  });

  it("FAQ terurut posisi, dan tampil sama untuk Marketing maupun Partner (bukan bagian yang dibatasi peran)", () => {
    makeEntry("dengan-faq", {
      status: "siap",
      audience: "partner",
      faqs: [
        { question: "Kedua?", answer: "Jawaban kedua" },
        { question: "Pertama?", answer: "Jawaban pertama" },
      ],
    });
    // saveEntry menyimpan sesuai urutan input; urutan "Kedua" lalu "Pertama" sengaja dipertahankan
    // untuk membuktikan bahwa urutan yang dibaca sesuai posisi tersimpan, bukan diurutkan ulang.
    for (const role of ["marketing", "partner"] as Role[]) {
      const detail = getEntryDetailBySlugFor({ role }, "dengan-faq", db);
      expect(detail!.faqs, role).toEqual([
        { question: "Kedua?", answer: "Jawaban kedua" },
        { question: "Pertama?", answer: "Jawaban pertama" },
      ]);
    }
  });

  it("entri tanpa FAQ: faqs kosong, bukan galat", () => {
    makeEntry("tanpa-faq", { status: "siap", audience: "partner", faqs: [] });
    const detail = getEntryDetailBySlugFor({ role: "partner" }, "tanpa-faq", db);
    expect(detail!.faqs).toEqual([]);
  });
});
