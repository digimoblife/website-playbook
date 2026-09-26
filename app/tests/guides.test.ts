// Panduan skenario (Langkah 5): aturan publish, akses pembaca, dan tautan fitur yang tidak boleh
// membocorkan entri yang tidak boleh dilihat pembaca.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { guideHistory, guides } from "@/db/schema";
import { archiveEntry, createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { PUBLISH_INVISIBLE_MESSAGE } from "@/lib/publish";
import {
  archiveGuide,
  createGuide,
  getEditableGuide,
  getGuideDetailBySlugFor,
  guideLinkWarnings,
  listGuidesFor,
  listLinkableEntries,
  parseGuideInput,
  publishGuide,
  restoreGuide,
  saveGuide,
  unpublishGuide,
} from "@/lib/guides";
import { ALL_AUDIENCES, ALL_STATUSES, insertUserRow, makeTestDb, validGuideInput, validInput } from "./helpers";

let db: AppDb;
let adminId: number;

beforeEach(() => {
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
});

function newGuide(title = "Panduan Uji"): number {
  const r = createGuide({ title, actorId: adminId }, db);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

function newEntry(slug: string, over: Parameters<typeof validInput>[0] = {}, publish = true): number {
  const r = createEntry({ title: slug, actorId: adminId }, db);
  if (!r.ok) throw new Error(r.error);
  const saved = saveEntry(r.id, validInput({ title: `Fitur ${slug}`, slug, ...over }), adminId, db);
  if (!saved.ok) throw new Error(saved.error);
  if (publish) {
    const p = publishEntry(r.id, adminId, db);
    if (!p.ok) throw new Error(p.error);
  }
  return r.id;
}

const marketing = { role: "marketing" as const, active: true };
const partner = { role: "partner" as const, active: true };

describe("Membuat dan menyimpan panduan", () => {
  it("panduan baru selalu Internal, beraudiens Internal, belum terbit, dan tercatat di riwayat", () => {
    const id = newGuide();
    const guide = getEditableGuide(id, db)!;
    expect(guide).toMatchObject({ status: "internal", audience: "internal", isPublished: false, slug: "panduan-uji" });
    const history = db.select().from(guideHistory).where(eq(guideHistory.guideId, id)).all();
    expect(history.map((h) => h.summary)).toEqual(["Membuat panduan"]);
  });

  it("slug ganda diberi akhiran angka", () => {
    newGuide("Demo Sepuluh Menit");
    const r = createGuide({ title: "Demo Sepuluh Menit", actorId: adminId }, db);
    expect(r).toMatchObject({ ok: true, slug: "demo-sepuluh-menit-2" });
  });

  it("menyimpan langkah beserta tautan fitur dan mencatat bagian yang berubah", () => {
    const entryId = newEntry("fitur-a");
    const id = newGuide();
    const r = saveGuide(id, validGuideInput({ steps: [{ text: "Tunjukkan fitur A", entryId }] }), adminId, db);
    expect(r.ok).toBe(true);
    expect(getEditableGuide(id, db)!.steps).toEqual([{ text: "Tunjukkan fitur A", entryId }]);
    const summaries = db.select().from(guideHistory).where(eq(guideHistory.guideId, id)).all().map((h) => h.summary);
    expect(summaries).toContain("Mengubah: Ringkasan, Kapan dipakai, Langkah");
    expect(summaries).toContain("Status: Internal ke Siap diumumkan");
    expect(summaries).toContain("Audiens: Internal saja ke Marketing dan Partner");
  });

  it("menolak tautan ke entri yang tidak ada atau sudah diarsipkan", () => {
    const archived = newEntry("fitur-arsip");
    archiveEntry(archived, adminId, db);
    const id = newGuide();
    expect(saveGuide(id, validGuideInput({ steps: [{ text: "x", entryId: archived }] }), adminId, db)).toMatchObject({
      ok: false,
    });
    expect(saveGuide(id, validGuideInput({ steps: [{ text: "x", entryId: 9999 }] }), adminId, db)).toMatchObject({
      ok: false,
    });
  });

  it("validasi input: judul, slug, langkah kosong, dan batas langkah", () => {
    expect(parseGuideInput(validGuideInput({ title: "" }))).toMatchObject({ ok: false });
    expect(parseGuideInput(validGuideInput({ slug: "Slug Salah" }))).toMatchObject({ ok: false });
    expect(parseGuideInput(validGuideInput({ steps: [{ text: "  ", entryId: null }] }))).toMatchObject({ ok: false });
    const many = Array.from({ length: 16 }, (_, i) => ({ text: `L${i}`, entryId: null }));
    expect(parseGuideInput(validGuideInput({ steps: many }))).toMatchObject({ ok: false });
    expect(parseGuideInput({ ...validGuideInput(), status: "rahasia" })).toMatchObject({ ok: false });
    expect(parseGuideInput("bukan objek")).toMatchObject({ ok: false });
  });

  it("panduan yang diarsipkan tidak bisa disunting", () => {
    const id = newGuide();
    archiveGuide(id, adminId, db);
    expect(saveGuide(id, validGuideInput(), adminId, db)).toMatchObject({ ok: false });
  });
});

describe("Aturan publish panduan", () => {
  it("panduan Internal ditolak dengan pesan yang sama seperti entri", () => {
    const id = newGuide();
    saveGuide(id, validGuideInput({ status: "internal" }), adminId, db);
    expect(publishGuide(id, adminId, db)).toEqual({ ok: false, error: PUBLISH_INVISIBLE_MESSAGE });
  });

  it("panduan yang akan terlihat harus punya ringkasan dan minimal satu langkah", () => {
    const id = newGuide();
    saveGuide(id, validGuideInput({ summary: "", steps: [] }), adminId, db);
    const r = publishGuide(id, adminId, db);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Ringkasan, Langkah (minimal satu)");
    expect(getEditableGuide(id, db)!.isPublished).toBe(false);
  });

  it("publish, tarik kembali, arsip, dan pulihkan", () => {
    const id = newGuide();
    saveGuide(id, validGuideInput(), adminId, db);
    expect(publishGuide(id, adminId, db).ok).toBe(true);
    expect(publishGuide(id, adminId, db)).toMatchObject({ ok: false });
    expect(unpublishGuide(id, adminId, db).ok).toBe(true);
    publishGuide(id, adminId, db);
    expect(archiveGuide(id, adminId, db).ok).toBe(true);
    expect(getEditableGuide(id, db)).toMatchObject({ isPublished: false });
    expect(publishGuide(id, adminId, db)).toMatchObject({ ok: false });
    expect(restoreGuide(id, adminId, db).ok).toBe(true);
    expect(getEditableGuide(id, db)).toMatchObject({ archivedAt: null, isPublished: false });
  });

  it("pemicu database menolak panduan terarsip yang terbit, walau lewat SQL langsung", () => {
    const id = newGuide();
    archiveGuide(id, adminId, db);
    expect(() => db.update(guides).set({ isPublished: true }).where(eq(guides.id, id)).run()).toThrow(
      /Panduan yang diarsipkan tidak boleh terbit/,
    );
  });
});

describe("Akses pembaca ke panduan", () => {
  it("matriks status x audiens x terbit sama dengan aturan entri", () => {
    for (const status of ALL_STATUSES) {
      for (const audience of ALL_AUDIENCES) {
        for (const published of [true, false]) {
          const slug = `p-${status}-${audience}-${published ? "terbit" : "draf"}`;
          const id = newGuide(slug);
          db.update(guides)
            .set({ status, audience, isPublished: published, summary: "s" })
            .where(eq(guides.id, id))
            .run();
          const visible = published && status !== "internal";
          const forMarketing = visible && audience !== "internal";
          const forPartner = visible && audience === "partner";
          expect(getGuideDetailBySlugFor(marketing, slug, db) !== null, `${slug} marketing`).toBe(forMarketing);
          expect(getGuideDetailBySlugFor(partner, slug, db) !== null, `${slug} partner`).toBe(forPartner);
          expect(listGuidesFor(marketing, db).some((g) => g.slug === slug)).toBe(forMarketing);
          expect(listGuidesFor(partner, db).some((g) => g.slug === slug)).toBe(forPartner);
        }
      }
    }
  });

  it("pengguna nonaktif, tanpa sesi, dan panduan terarsip tidak terlihat", () => {
    const id = newGuide();
    saveGuide(id, validGuideInput(), adminId, db);
    publishGuide(id, adminId, db);
    expect(getGuideDetailBySlugFor({ role: "marketing", active: false }, "panduan-uji", db)).toBeNull();
    expect(getGuideDetailBySlugFor(null, "panduan-uji", db)).toBeNull();
    expect(listGuidesFor(undefined, db)).toEqual([]);
    archiveGuide(id, adminId, db);
    expect(getGuideDetailBySlugFor(marketing, "panduan-uji", db)).toBeNull();
  });

  it("tautan fitur hanya muncul bila pembaca boleh melihat entrinya; judulnya tidak bocor", () => {
    const forAll = newEntry("fitur-semua", { audience: "partner" });
    const forMarketingOnly = newEntry("fitur-khusus-marketing", { audience: "marketing" });
    const draft = newEntry("fitur-draf", { audience: "partner" }, false);
    const id = newGuide();
    saveGuide(
      id,
      validGuideInput({
        steps: [
          { text: "Langkah satu", entryId: forAll },
          { text: "Langkah dua", entryId: forMarketingOnly },
          { text: "Langkah tiga", entryId: draft },
          { text: "Langkah empat", entryId: null },
        ],
      }),
      adminId,
      db,
    );
    publishGuide(id, adminId, db);

    const m = getGuideDetailBySlugFor(marketing, "panduan-uji", db)!;
    expect(m.steps.map((s) => s.entry?.slug ?? null)).toEqual(["fitur-semua", "fitur-khusus-marketing", null, null]);

    const p = getGuideDetailBySlugFor(partner, "panduan-uji", db)!;
    expect(p.steps.map((s) => s.entry?.slug ?? null)).toEqual(["fitur-semua", null, null, null]);
    const json = JSON.stringify(p);
    expect(json).not.toContain("fitur-khusus-marketing");
    expect(json).not.toContain("Fitur fitur-draf");
    // Teks langkahnya sendiri tetap tampil.
    expect(p.steps.map((s) => s.text)).toEqual(["Langkah satu", "Langkah dua", "Langkah tiga", "Langkah empat"]);
  });

  it("peringatan editor menyebut langkah yang tautannya tidak terlihat oleh sebagian pembaca", () => {
    const forAll = newEntry("fitur-semua", { audience: "partner" });
    const forMarketingOnly = newEntry("fitur-khusus-marketing", { audience: "marketing" });
    const linkable = listLinkableEntries(db);
    const warnings = guideLinkWarnings(
      {
        status: "siap",
        audience: "partner",
        steps: [
          { text: "a", entryId: forAll },
          { text: "b", entryId: forMarketingOnly },
        ],
      },
      linkable,
    );
    expect(warnings).toEqual([expect.stringMatching(/^Langkah 2: .*Partner/)]);
    // Panduan Internal tidak punya pembaca, jadi tidak ada peringatan.
    expect(guideLinkWarnings({ status: "internal", audience: "partner", steps: [{ text: "b", entryId: forMarketingOnly }] }, linkable)).toEqual([]);
  });
});
