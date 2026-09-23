// pullFromGithub (lib/admin-entries.ts): entri hasil tarikan SELALU Internal/Internal, satu
// transaksi dengan github_imports dan riwayat, dan boleh ditarik berkali-kali (entri baru tiap kali).
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, entryHistory, githubImports } from "@/db/schema";
import { getEditableEntry, pullFromGithub, type GithubPullDraft, type GithubPullInfo } from "@/lib/admin-entries";
import { insertUserRow, makeTestDb } from "./helpers";

let db: AppDb;
let adminId: number;

beforeEach(() => {
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
});

const pr: GithubPullInfo = { number: 7, title: "Tambah kunci stok", url: "https://github.com/x/pulls/7" };

const fullDraft: GithubPullDraft = {
  title: "Kunci stok",
  summary: "Ringkasan draf",
  problem: "Masalah draf",
  forWhom: "Toko besar",
  explanation: "Penjelasan draf",
  kind: "addon",
  nature: "update",
};

describe("pullFromGithub: entri baru selalu Internal/Internal", () => {
  it("field draft normal tersimpan, status dan audience dipaksa internal", () => {
    const res = pullFromGithub(pr, fullDraft, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = getEditableEntry(res.id, db)!;
    expect(e).toMatchObject({
      title: "Kunci stok",
      summary: "Ringkasan draf",
      problem: "Masalah draf",
      forWhom: "Toko besar",
      explanation: "Penjelasan draf",
      kind: "addon",
      nature: "update",
      status: "internal",
      audience: "internal",
      isPublished: false,
    });
  });

  it("draft yang mencoba menyisipkan status/audience diabaikan sepenuhnya (bukan hanya di tipe)", () => {
    const malicious = { ...fullDraft, status: "siap", audience: "partner" } as GithubPullDraft & {
      status: string;
      audience: string;
    };
    const res = pullFromGithub(pr, malicious, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = getEditableEntry(res.id, db)!;
    expect(e.status).toBe("internal");
    expect(e.audience).toBe("internal");
  });

  it("field yang bukan bagian draft (canPromise, cannotPromise, promoText, steps, faqs) selalu kosong", () => {
    const res = pullFromGithub(pr, fullDraft, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = getEditableEntry(res.id, db)!;
    expect(e.canPromise).toBe("");
    expect(e.cannotPromise).toBe("");
    expect(e.promoText).toBe("");
    expect(e.steps).toEqual([]);
    expect(e.faqs).toEqual([]);
  });

  it("kind/nature asing pada draft diganti default aman (core/new)", () => {
    const res = pullFromGithub(
      pr,
      { ...fullDraft, kind: "tidak-dikenal", nature: "entah" },
      adminId,
      db,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = getEditableEntry(res.id, db)!;
    expect(e.kind).toBe("core");
    expect(e.nature).toBe("new");
  });

  it("title kosong pada draft -> jatuh ke judul PR", () => {
    const res = pullFromGithub(pr, { ...fullDraft, title: "  " }, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(getEditableEntry(res.id, db)!.title).toBe(pr.title);
  });

  it("sourcePrNumber tercatat di baris entries", () => {
    const res = pullFromGithub(pr, fullDraft, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = db.select({ n: entries.sourcePrNumber }).from(entries).where(eq(entries.id, res.id)).get();
    expect(row?.n).toBe(7);
  });
});

describe("pullFromGithub: github_imports dan riwayat", () => {
  it("mencatat satu baris github_imports dengan pr_number, entry_id, dan actor_id yang benar", () => {
    const res = pullFromGithub(pr, fullDraft, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rows = db.select().from(githubImports).where(eq(githubImports.entryId, res.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ prNumber: 7, prTitle: pr.title, prUrl: pr.url, actorId: adminId, entryId: res.id });
  });

  it("riwayat entri menyebut nomor PR dan judulnya, serta 'draf oleh AI'", () => {
    const res = pullFromGithub(pr, fullDraft, adminId, db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rows = db.select().from(entryHistory).where(eq(entryHistory.entryId, res.id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toContain("PR #7");
    expect(rows[0].summary).toContain(pr.title);
    expect(rows[0].summary).toContain("draf oleh AI");
  });
});

describe("pullFromGithub: PR yang sama ditarik berkali-kali", () => {
  it("menghasilkan DUA entri berbeda, bukan menimpa entri lama", () => {
    const first = pullFromGithub(pr, fullDraft, adminId, db);
    const second = pullFromGithub(pr, { ...fullDraft, summary: "Ringkasan kedua" }, adminId, db);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.id).not.toBe(second.id);

    const e1 = getEditableEntry(first.id, db)!;
    const e2 = getEditableEntry(second.id, db)!;
    expect(e1.summary).toBe("Ringkasan draf"); // entri pertama TIDAK berubah
    expect(e2.summary).toBe("Ringkasan kedua");
  });

  it("dua baris github_imports terpisah, masing-masing pr_number 7 tapi entry_id berbeda", () => {
    const first = pullFromGithub(pr, fullDraft, adminId, db);
    const second = pullFromGithub(pr, fullDraft, adminId, db);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const rows = db.select().from(githubImports).where(eq(githubImports.prNumber, 7)).all();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.entryId))).toEqual(new Set([first.id, second.id]));
  });

  it("suntingan manual pada entri hasil tarikan pertama bertahan setelah tarikan kedua", () => {
    const first = pullFromGithub(pr, fullDraft, adminId, db);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    db.update(entries).set({ summary: "Sudah disunting Admin" }).where(eq(entries.id, first.id)).run();

    pullFromGithub(pr, fullDraft, adminId, db);

    expect(getEditableEntry(first.id, db)!.summary).toBe("Sudah disunting Admin");
  });
});

describe("pullFromGithub: slug tetap unik", () => {
  it("dua tarikan PR yang sama menghasilkan slug berbeda (bukan bentrok)", () => {
    const first = pullFromGithub(pr, fullDraft, adminId, db);
    const second = pullFromGithub(pr, fullDraft, adminId, db);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.slug).not.toBe(second.slug);
  });
});
