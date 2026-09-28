// Triase perubahan GitHub (Langkah 6d): aturan murni di lib/triage.ts, lalu pengelompokan dan
// tindak lanjut di lib/github-changes.ts dengan database di memori.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, entryHistory, githubChanges } from "@/db/schema";
import { createEntry, listInbox, saveEntry } from "@/lib/admin-entries";
import {
  applyTriageToNewEntry,
  countNewGithubChanges,
  createEntryFromCommit,
  getEnrichedGithubChange,
  groupChanges,
  listNewGithubChanges,
  markGithubChangeReviewed,
  needsDraftReminder,
  setGithubChangeBucket,
} from "@/lib/github-changes";
import { commitType, fiturSlugs, guessKind, triageBucket } from "@/lib/triage";
import { insertUserRow, makeTestDb, validInput } from "./helpers";

describe("Aturan triase (murni)", () => {
  it.each([
    ["feat(stok): kunci stok", "feat", "kandidat"],
    ["feat!: ubah checkout", "feat", "kandidat"],
    ["refactor: rapikan layanan", "refactor", "kandidat"],
    ["perbaiki teks tombol", null, "kandidat"],
    ["fix(checkout): ongkir nol", "fix", "perbaikan"],
    ["Fix: huruf besar", "fix", "perbaikan"],
    ["docs: README", "docs", "arsip"],
    ["test: tambah tes", "test", "arsip"],
    ["chore(deps): naikkan versi", "chore", "arsip"],
    ["style: warna tombol", "style", "arsip"],
    ["copy: ubah teks", "copy", "arsip"],
    ["feature: tanpa spasi setelah titik dua bukan tipe", "feature", "kandidat"],
  ])("%s -> tipe %s, kelompok %s", (title, type, bucket) => {
    expect(commitType(title)).toBe(type);
    expect(triageBucket(title)).toBe(bucket);
  });

  it("judul tanpa spasi setelah titik dua tidak dianggap bertipe", () => {
    expect(commitType("feat:feature hide membership")).toBeNull();
  });

  it("fiturSlugs: satu atau lebih trailer, huruf kecil, tanpa duplikat, hanya di awal baris", () => {
    expect(fiturSlugs("feat: x\n\nFitur: kunci-stok\nfitur: Ongkir-Otomatis\nFitur: kunci-stok")).toEqual([
      "kunci-stok",
      "ongkir-otomatis",
    ]);
    expect(fiturSlugs("menyebut Fitur: di tengah kalimat")).toEqual([]);
    expect(fiturSlugs("Fitur: dua kata")).toEqual([]);
  });

  describe("guessKind (audit/validasi-jenis.md)", () => {
    const addonNames = ["Kunci stok", "kunci-stok", "Jadwal toko", "jadwal-toko"];

    it("file layanan add-on tertentu -> Add-on", () => {
      expect(guessKind({ title: "update", files: ["src/services/add-ons/stock-lock.ts"] }, addonNames)).toMatchObject({
        kind: "addon",
      });
    });

    it("hanya file sistem add-on (akses, penagihan, versi, definisi) -> Fitur inti", () => {
      const files = ["src/services/add-ons/billing.ts", "src/services/add-ons/releases.ts", "src/app/[storeSlug]/admin/add-ons/page.tsx"];
      expect(guessKind({ title: "adding versioning", files }, addonNames).kind).toBe("core");
    });

    it("judul menyebut nama add-on dari peta fitur -> Add-on; kata lain yang mirip tidak", () => {
      expect(guessKind({ title: "feat: jadwal toko untuk hari libur", files: [] }, addonNames).kind).toBe("addon");
      expect(guessKind({ title: "feat: stok produk digital", files: [] }, addonNames).kind).toBe("core");
    });

    it("perubahan hanya di superadmin diberi keterangan area, tetap Fitur inti", () => {
      const g = guessKind({ title: "x", files: ["src/app/superadmin/add-ons/page.tsx"] }, addonNames);
      expect(g).toMatchObject({ kind: "core", area: "area superadmin (internal Lapaq)" });
    });
  });
});

let db: AppDb;
let adminId: number;

function change(values: Partial<typeof githubChanges.$inferInsert> & { title: string }) {
  return db
    .insert(githubChanges)
    .values({
      repo: "a/b",
      kind: "commit",
      commitSha: Math.random().toString(16).slice(2).padEnd(40, "0").slice(0, 40),
      url: "https://github.com/a/b",
      bucket: triageBucket(values.title),
      ...values,
    })
    .returning()
    .get().id;
}

function entry(slug: string, kind: "core" | "addon" = "core", title = slug) {
  const r = createEntry({ title, actorId: adminId }, db);
  if (!r.ok) throw new Error(r.error);
  db.update(entries).set({ slug, kind }).where(eq(entries.id, r.id)).run();
  return r.id;
}

describe("Kelompok dan pengelompokan per fitur", () => {
  beforeEach(() => {
    db = makeTestDb();
    adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  });

  it("Pembaruan untuk entri yang ada (Jenis dari entri), Kandidat fitur baru, dan tanpa kunci", () => {
    const stok = entry("kunci-stok", "addon", "Kunci stok");
    change({ title: "feat: perpanjang kunci stok", body: "Fitur: kunci-stok" });
    change({ title: "feat: dukungan varian", body: "Fitur: kunci-stok" });
    change({ title: "feat: poin loyalitas", body: "Fitur: poin-loyalitas" });
    change({ title: "perbaiki teks tombol checkout" });
    change({ title: "fix: ongkir nol", body: "Fitur: kunci-stok" });
    change({ title: "docs: README" });

    const kandidat = listNewGithubChanges("kandidat", db);
    const groups = groupChanges(kandidat);
    expect(groups.map((g) => [g.type, g.changes.length])).toEqual([
      ["pembaruan", 2],
      ["fitur-baru", 1],
      ["tanpa-kunci", 1],
    ]);
    expect(groups[0]).toMatchObject({ entry: { id: stok, kind: "addon" }, label: "Pembaruan: Kunci stok (Add-on)" });
    expect(groups[1].label).toBe("Kandidat fitur baru: poin-loyalitas");
    expect(countNewGithubChanges(db)).toEqual({ kandidat: 4, perbaikan: 1, arsip: 1 });
  });

  it("Admin bisa mengembalikan dari Arsip menjadi kandidat; nilai asing ditolak", () => {
    const id = change({ title: "docs: panduan onboarding baru" });
    expect(listNewGithubChanges("kandidat", db)).toEqual([]);
    expect(setGithubChangeBucket(id, "kandidat", db).ok).toBe(true);
    expect(listNewGithubChanges("kandidat", db).map((c) => c.id)).toEqual([id]);
    expect(setGithubChangeBucket(id, "rahasia", db).ok).toBe(false);
  });

  it("Tandai ditinjau pada Pembaruan menautkan perubahan ke entrinya", () => {
    const stok = entry("kunci-stok", "addon");
    const id = change({ title: "feat: x", body: "Fitur: kunci-stok" });
    markGithubChangeReviewed(id, adminId, db);
    expect(db.select().from(githubChanges).where(eq(githubChanges.id, id)).get()).toMatchObject({
      state: "ditinjau",
      entryId: stok,
    });
  });

  it("Buat entri dari commit berkunci Fitur baru: slug = kunci, Jenis dari tebakan, tetap Internal, tercatat", () => {
    const id = change({
      title: "feat: jadwal libur toko",
      body: "Fitur: jadwal-libur",
      files: JSON.stringify(["src/services/add-ons/store-schedule.ts"]),
    });
    const r = createEntryFromCommit(id, adminId, db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = db.select().from(entries).where(eq(entries.id, r.entryId)).get()!;
    expect(row).toMatchObject({ slug: "jadwal-libur", kind: "addon", status: "internal", audience: "internal", isPublished: false });
    const history = db.select().from(entryHistory).where(eq(entryHistory.entryId, r.entryId)).all().map((h) => h.summary);
    expect(history.at(-1)).toMatch(/^Jenis ditebak Add-on \(menyentuh layanan add-on store-schedule\); periksa di editor; slug memakai kunci Fitur: jadwal-libur$/);

    // Commit berikutnya dengan kunci yang sama sekarang terbaca sebagai Pembaruan entri itu.
    change({ title: "feat: jadwal libur nasional", body: "Fitur: jadwal-libur" });
    expect(groupChanges(listNewGithubChanges("kandidat", db))[0]).toMatchObject({ type: "pembaruan", entry: { id: r.entryId } });
  });

  it("slug kunci yang sudah dipakai entri lain tidak direbut", () => {
    entry("dipakai");
    const other = entry("entri-lain");
    const id = change({ title: "feat: x", body: "Fitur: dipakai" });
    // Kunci "dipakai" cocok dengan entri yang ada, jadi applyTriage hanya mengatur Jenis.
    applyTriageToNewEntry(other, getEnrichedGithubChange(id, db)!, adminId, db);
    expect(db.select().from(entries).where(eq(entries.id, other)).get()!.slug).toBe("entri-lain");
  });
});

describe("Pengingat draf yang menunggu", () => {
  beforeEach(() => {
    db = makeTestDb();
    adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  });

  it("hanya draf dari GitHub atau yang siap tampil, dan hanya bila lebih dari 7 hari", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const peta = entry("peta-lama"); // Internal, tidak disentuh: tidak diingatkan
    const siap = entry("siap-tampil");
    saveEntry(siap, validInput({ slug: "siap-tampil" }), adminId, db); // Beta, Marketing dan Partner
    const dariGithub = entry("dari-github");
    change({ title: "feat: x", entryId: dariGithub, state: "ditinjau" });
    const baru = entry("baru-dibuat");
    db.update(entries).set({ updatedAt: old }).where(eq(entries.id, peta)).run();
    db.update(entries).set({ updatedAt: old }).where(eq(entries.id, siap)).run();
    db.update(entries).set({ updatedAt: old }).where(eq(entries.id, dariGithub)).run();

    const flagged = listInbox(db).filter(needsDraftReminder).map((r) => r.slug).sort();
    expect(flagged).toEqual(["dari-github", "siap-tampil"]);
    void baru;
  });
});

describe("Regresi: subquery hitung merujuk ke baris luar yang benar", () => {
  beforeEach(() => {
    db = makeTestDb();
    adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  });

  it("Inbox: jumlah langkah per entri benar walau id langkah dan id entri berbeda", () => {
    // Beberapa entri dulu supaya id entri dan id langkah tidak kebetulan sama.
    for (const s of ["a", "b", "c"]) entry(`kosong-${s}`);
    const withSteps = entry("dua-langkah");
    saveEntry(
      withSteps,
      validInput({ slug: "dua-langkah", steps: [{ text: "Satu", mediaId: null }, { text: "Dua", mediaId: null }] }),
      adminId,
      db,
    );
    const inbox = new Map(listInbox(db).map((r) => [r.slug, r]));
    expect(inbox.get("dua-langkah")!.stepCount).toBe(2);
    expect(inbox.get("kosong-a")!.stepCount).toBe(0);
    expect(inbox.get("dua-langkah")!.canPublishNow).toBe(true);
  });
});
