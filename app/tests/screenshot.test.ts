// Screenshot otomatis (Langkah 6e).
//  - Pengurai skenario: tes murni.
//  - Penjalan: Chromium SUNGGUHAN terhadap "toko demo" palsu (server HTTP lokal di tes). Bila
//    Chromium tidak tersedia di mesin ini, bagian itu dilewati dengan pesan yang jelas; di mesin
//    pengembangan dan VPS (setelah `npx playwright install chromium`) bagian ini wajib berjalan.
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { chromium } from "playwright-core";
import type { AppDb } from "@/db/client";
import { entryHistory, media, screenshotScenarios } from "@/db/schema";
import { createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { getEntryDetailBySlugFor } from "@/lib/entries";
import { getMediaForViewer } from "@/lib/media";
import { fillVariables, parseScenario } from "@/lib/screenshot-scenario";
import { runScenario, saveScenario } from "@/lib/screenshot-runner";
import { saveGeneralSettings } from "@/lib/settings";
import { insertUserRow, makeTestDb, validInput } from "./helpers";

describe("parseScenario", () => {
  it("skenario lengkap", () => {
    const r = parseScenario(
      "# komentar\nukuran 390x844\nbuka /produk?id=1\nklik text=Tambah ke keranjang\nisi #email => ${DEMO_STORE_EMAIL}\ntunggu 500\ntunggu .keranjang\nfoto\nfoto .kartu",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.map((s) => s.op)).toEqual(["ukuran", "buka", "klik", "isi", "tunggu", "tunggu", "foto", "foto"]);
    expect(r.steps.filter((s) => s.op === "foto").map((s) => (s as { key: string }).key)).toEqual(["foto-1", "foto-2"]);
    expect(r.steps[3]).toMatchObject({ selector: "#email", value: "${DEMO_STORE_EMAIL}" });
  });

  it.each([
    ["buka https://situs-lain.com", "jalur"],
    ["buka //situs-lain.com/x", "jalur"],
    ["buka javascript:alert(1)", "jalur"],
    ["buka /a\njalankan kode()\nfoto", "tidak dikenal"],
    ["buka /a\ntunggu 99999\nfoto", "5000"],
    ["buka /a\nisi #x tanpa panah\nfoto", "isi #email => nilai"],
    ["buka /a\nfoto\nukuran 390x844", "baris pertama"],
    ["ukuran 100x100\nbuka /a\nfoto", "di luar batas"],
    ["buka /a", "minimal satu \"foto\""],
    ["foto", "minimal satu \"buka\""],
    ["buka /a\n" + "foto\n".repeat(6), "maksimal 5 foto"],
  ])("ditolak: %j", (script, pesan) => {
    const r = parseScenario(script);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join(" ")).toContain(pesan);
  });

  it("fillVariables hanya mengisi DEMO_STORE_ dan melaporkan nama variabel yang kosong", () => {
    expect(fillVariables("${DEMO_STORE_EMAIL}", { DEMO_STORE_EMAIL: "a@b.c" })).toEqual({ ok: true, value: "a@b.c" });
    expect(fillVariables("${DEMO_STORE_PASSWORD}", {})).toEqual({ ok: false, missing: "DEMO_STORE_PASSWORD" });
    expect(fillVariables("${AI_API_KEY}", { AI_API_KEY: "rahasia" })).toEqual({ ok: true, value: "${AI_API_KEY}" });
  });
});

// ---------- Penjalan dengan Chromium sungguhan ----------

const TOKO = `<!doctype html><html><head><style>body{margin:0;font:16px sans-serif}.kartu{width:200px;height:120px;background:#0e6e5c;color:#fff}</style></head>
<body><h1>Toko Demo</h1><div class="kartu">Kaos Polos</div>
<button id="beli" onclick="document.body.insertAdjacentHTML('beforeend','<p class=keranjang>1 barang</p>')">Tambah ke keranjang</button>
<input id="email"><a id="keluar" href="https://contoh.invalid/">Situs lain</a></body></html>`;

let server: Server;
let base = "";
let browserReady = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(TOKO);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    const b = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
    await b.close();
    browserReady = true;
  } catch {
    console.warn("Chromium tidak tersedia: tes penjalan screenshot dilewati. Pasang dengan `npx playwright install chromium`.");
  }
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("runScenario dengan Chromium", () => {
  let db: AppDb;
  let dir: string;
  let adminId: number;
  let entryId: number;
  const deps = () => ({ mediaDir: dir, stepTimeoutMs: 2000, env: { DEMO_STORE_EMAIL: "demo@toko.id", DEMO_STORE_PASSWORD: "sandi-rahasia-123" } });

  beforeEach(() => {
    db = makeTestDb();
    dir = mkdtempSync(join(tmpdir(), "playbook-shot-"));
    adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
    const r = createEntry({ title: "Kaos", actorId: adminId }, db);
    if (!r.ok) throw new Error(r.error);
    entryId = r.id;
    saveEntry(entryId, validInput({ slug: "kaos" }), adminId, db);
    publishEntry(entryId, adminId, db);
    saveGeneralSettings({ productName: "Lapaq", githubRepo: "", demoStoreUrl: base }, adminId, db);
    return () => rmSync(dir, { recursive: true, force: true });
  });

  const autoMedia = () => db.select().from(media).where(eq(media.entryId, entryId)).all();

  it("berhasil: dua foto PNG tersimpan, status dan riwayat tercatat, tampil ke pembaca", async (ctx) => {
    if (!browserReady) return ctx.skip();
    saveScenario(entryId, "ukuran 390x844\nbuka /\nklik #beli\ntunggu .keranjang\nisi #email => ${DEMO_STORE_EMAIL}\nfoto\nfoto .kartu", db);
    const outcome = await runScenario(entryId, adminId, db, deps());
    expect(outcome).toEqual({ status: "berhasil", photos: 2 });
    const rows = autoMedia();
    expect(rows.map((m) => [m.autoKey, m.source, m.failed])).toEqual([
      ["foto-1", "auto", false],
      ["foto-2", "auto", false],
    ]);
    expect(db.select().from(screenshotScenarios).get()).toMatchObject({ lastStatus: "berhasil", lastError: null });
    expect(db.select().from(entryHistory).all().at(-1)!.summary).toBe("Screenshot otomatis diperbarui (2 foto)");
    const detail = getEntryDetailBySlugFor({ role: "partner" }, "kaos", db)!;
    expect(detail.images.map((i) => i.id).sort()).toEqual(rows.map((m) => m.id).sort());
  }, 60_000);

  it("dijalankan ulang: baris media sama (tautan langkah aman), berkas diganti; foto berkurang dihapus", async (ctx) => {
    if (!browserReady) return ctx.skip();
    saveScenario(entryId, "buka /\nfoto\nfoto .kartu", db);
    await runScenario(entryId, adminId, db, deps());
    const [first, second] = autoMedia();
    await runScenario(entryId, adminId, db, deps());
    const again = autoMedia();
    expect(again.map((m) => m.id)).toEqual([first.id, second.id]);
    expect(again[0].filePath).not.toBe(first.filePath);

    saveScenario(entryId, "buka /\nfoto", db);
    await runScenario(entryId, adminId, db, deps());
    expect(autoMedia().map((m) => m.autoKey)).toEqual(["foto-1"]);
  }, 60_000);

  it("gagal: screenshot lama ditandai gagal dan TIDAK tampil ke pembaca; Admin tetap bisa melihat", async (ctx) => {
    if (!browserReady) return ctx.skip();
    saveScenario(entryId, "buka /\nfoto", db);
    await runScenario(entryId, adminId, db, deps());
    const [shot] = autoMedia();

    saveScenario(entryId, "buka /\nklik #tidak-ada\nfoto", db);
    const outcome = await runScenario(entryId, adminId, db, deps());
    expect(outcome.status).toBe("gagal");
    expect(outcome.status === "gagal" && outcome.error).toMatch(/^Baris 2 \(klik\)/);
    expect(autoMedia()[0]).toMatchObject({ id: shot.id, failed: true });
    expect(getEntryDetailBySlugFor({ role: "partner" }, "kaos", db)!.images).toEqual([]);
    expect(getMediaForViewer({ role: "marketing" }, shot.id, db)).toBeNull();
    expect(getMediaForViewer({ role: "admin" }, shot.id, db)).not.toBeNull();
    expect(db.select().from(entryHistory).all().at(-1)!.summary).toMatch(/^Screenshot gagal diperbarui: Baris 2/);

    // Berhasil lagi: tanda gagal hilang dan gambar kembali tampil.
    saveScenario(entryId, "buka /\nfoto", db);
    await runScenario(entryId, adminId, db, deps());
    expect(autoMedia()[0]).toMatchObject({ id: shot.id, failed: false });
  }, 60_000);

  it("gambar langkah yang gagal disembunyikan, teks langkahnya tetap", async (ctx) => {
    if (!browserReady) return ctx.skip();
    saveScenario(entryId, "buka /\nfoto", db);
    await runScenario(entryId, adminId, db, deps());
    const [shot] = autoMedia();
    saveEntry(entryId, validInput({ slug: "kaos", steps: [{ text: "Buka toko", mediaId: shot.id }] }), adminId, db);
    saveScenario(entryId, "buka /\nklik #tidak-ada\nfoto", db);
    await runScenario(entryId, adminId, db, deps());
    const detail = getEntryDetailBySlugFor({ role: "partner" }, "kaos", db)!;
    expect(detail.steps).toEqual([{ text: "Buka toko", mediaId: null }]);
    expect(detail.images).toEqual([]);
  }, 60_000);

  it("tidak boleh keluar dari toko demo", async (ctx) => {
    if (!browserReady) return ctx.skip();
    saveScenario(entryId, "buka /\nklik #keluar\nfoto", db);
    const outcome = await runScenario(entryId, adminId, db, deps());
    expect(outcome.status).toBe("gagal");
    expect(autoMedia()).toEqual([]);
  }, 60_000);

  it("variabel kosong disebut namanya; nilai rahasia tidak pernah muncul di galat", async (ctx) => {
    if (!browserReady) return ctx.skip();
    saveScenario(entryId, "buka /\nisi #email => ${DEMO_STORE_TIDAK_ADA}\nfoto", db);
    const missing = await runScenario(entryId, adminId, db, deps());
    expect(missing.status === "gagal" && missing.error).toContain("DEMO_STORE_TIDAK_ADA");

    saveScenario(entryId, "buka /\nisi #tidak-ada => ${DEMO_STORE_PASSWORD}\nfoto", db);
    const failed = await runScenario(entryId, adminId, db, deps());
    expect(failed.status).toBe("gagal");
    const everything = JSON.stringify([failed, db.select().from(screenshotScenarios).all(), db.select().from(entryHistory).all()]);
    expect(everything).not.toContain("sandi-rahasia-123");
  }, 60_000);

  it("tanpa URL toko demo atau tanpa skenario: gagal dengan pesan jelas, tanpa membuka browser", async () => {
    let launched = false;
    const launch = async () => {
      launched = true;
      throw new Error("tidak boleh dipanggil");
    };
    expect(await runScenario(entryId, adminId, db, { ...deps(), launch })).toEqual({ status: "gagal", error: "Entri ini belum punya skenario." });
    saveScenario(entryId, "buka /\nfoto", db);
    saveGeneralSettings({ productName: "Lapaq", githubRepo: "", demoStoreUrl: "" }, adminId, db);
    const saved = process.env.DEMO_STORE_URL;
    delete process.env.DEMO_STORE_URL;
    expect(await runScenario(entryId, adminId, db, { ...deps(), launch })).toEqual({
      status: "gagal",
      error: "URL toko demo belum diatur di Pengaturan.",
    });
    if (saved !== undefined) process.env.DEMO_STORE_URL = saved;
    expect(launched).toBe(false);
  });

  it("saveScenario menolak format salah dan memperingatkan kata sandi yang ditulis langsung", () => {
    expect(saveScenario(entryId, "jalankan()", db).ok).toBe(false);
    const r = saveScenario(entryId, "buka /masuk\nisi #password => rahasia123\nfoto", db);
    expect(r.ok && r.warnings[0]).toContain("${DEMO_STORE_PASSWORD}");
    const clean = saveScenario(entryId, "buka /masuk\nisi #password => ${DEMO_STORE_PASSWORD}\nfoto", db);
    expect(clean.ok && clean.warnings).toEqual([]);
  });
});
