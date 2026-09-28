// Pengaturan (Langkah 6a): validasi, enkripsi token, riwayat tanpa rahasia, dan cadangan ke
// variabel lingkungan supaya instalasi lama tetap berjalan.
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { appSettings, settingsHistory } from "@/db/schema";
import { decryptSecret, encryptionKey, encryptSecret } from "@/lib/secret-box";
import {
  clearGithubToken,
  getDemoStoreUrl,
  getGithubConfig,
  getProductName,
  getSettingsView,
  parseGithubRepo,
  saveGeneralSettings,
  setGithubToken,
  validateGithubToken,
} from "@/lib/settings";
import { insertUserRow, makeTestDb } from "./helpers";

const ORIGINAL_ENV = { ...process.env };
const KEY = randomBytes(32).toString("base64");
const TOKEN = "github_pat_11AAAAAAA0abcdefghijklmnopqrstuvwxyz0123456789WXYZ";

let db: AppDb;
let adminId: number;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, SETTINGS_ENCRYPTION_KEY: KEY };
  delete process.env.GITHUB_REPO;
  delete process.env.GITHUB_TOKEN;
  delete process.env.DEMO_STORE_URL;
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin", name: "Admin Uji" }).id;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const general = (over: Partial<Record<"productName" | "githubRepo" | "demoStoreUrl", unknown>> = {}) => ({
  productName: "Lapaq",
  githubRepo: "",
  demoStoreUrl: "",
  ...over,
});
const historyText = () => JSON.stringify(db.select().from(settingsHistory).all());

describe("parseGithubRepo", () => {
  it.each([
    ["bajaklautmalaka/lapaq", "bajaklautmalaka/lapaq"],
    ["https://github.com/bajaklautmalaka/lapaq", "bajaklautmalaka/lapaq"],
    ["https://www.github.com/Org-1/repo.name/", "Org-1/repo.name"],
    ["github.com/a/b.git", "a/b"],
    ["  http://github.com/a/b  ", "a/b"],
  ])("%s -> %s", (input, expected) => {
    expect(parseGithubRepo(input)).toEqual({ ok: true, repo: expected });
  });

  it.each(["", "lapaq", "a/b/c", "https://gitlab.com/a/b", "-a/b", "a/..", "a b/c", "https://github.com/a/b/pulls"])(
    "ditolak: %s",
    (input) => {
      expect(parseGithubRepo(input).ok).toBe(false);
    },
  );
});

describe("validateGithubToken", () => {
  it("menerima token GitHub biasa dan menolak yang kosong, pendek, atau berspasi", () => {
    expect(validateGithubToken(`  ${TOKEN}  `)).toEqual({ ok: true, token: TOKEN });
    expect(validateGithubToken("ghp_" + "a".repeat(36)).ok).toBe(true);
    for (const bad of ["", "pendek", "ghp_abc def ghi jkl mno pqr", 123, null]) {
      expect(validateGithubToken(bad).ok, String(bad)).toBe(false);
    }
  });
});

describe("secret-box", () => {
  it("enkripsi bolak-balik; kunci lain atau isi yang diubah gagal dibuka", () => {
    const key = encryptionKey(KEY);
    if (!key.ok) throw new Error(key.error);
    const sealed = encryptSecret(TOKEN, key.key);
    expect(sealed).not.toContain(TOKEN);
    expect(decryptSecret(sealed, key.key)).toBe(TOKEN);
    expect(encryptSecret(TOKEN, key.key)).not.toBe(sealed); // IV acak

    const other = encryptionKey(randomBytes(32).toString("hex"));
    if (!other.ok) throw new Error(other.error);
    expect(decryptSecret(sealed, other.key)).toBeNull();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("isi lain").toString("base64");
    expect(decryptSecret(parts.join("."), key.key)).toBeNull();
    expect(decryptSecret("bukan-format", key.key)).toBeNull();
  });

  it("kunci kosong atau bukan 32 byte ditolak tanpa menyebut nilainya", () => {
    expect(encryptionKey("").ok).toBe(false);
    const short = encryptionKey("cGVuZGVr");
    expect(short.ok).toBe(false);
    expect(!short.ok && short.error).not.toContain("cGVuZGVr");
  });
});

describe("Nama produk, repo, dan toko demo", () => {
  it("tanpa pengaturan: nama bawaan Lapaq, repo dan toko demo dari lingkungan", () => {
    process.env.GITHUB_REPO = "https://github.com/bajaklautmalaka/lapaq";
    process.env.DEMO_STORE_URL = "https://demo.lapaq.id";
    expect(getProductName(db)).toBe("Lapaq");
    expect(getGithubConfig(db)).toEqual({ repo: "bajaklautmalaka/lapaq", token: undefined });
    expect(getDemoStoreUrl(db)).toBe("https://demo.lapaq.id/");
    expect(getSettingsView(db)).toMatchObject({ githubRepoSource: "lingkungan", demoStoreUrlSource: "lingkungan" });
  });

  it("tanpa pengaturan dan tanpa lingkungan: repo null (bukan diam-diam repo Lapaq)", () => {
    expect(getGithubConfig(db)).toBeNull();
    expect(getSettingsView(db).githubRepoSource).toBe("tidak-ada");
  });

  it("menyimpan, menormalkan, mengalahkan lingkungan, dan mencatat setiap perubahan", () => {
    process.env.GITHUB_REPO = "bajaklautmalaka/lapaq";
    const r = saveGeneralSettings(
      general({ productName: "Produk X", githubRepo: "https://github.com/orang/produk-x.git", demoStoreUrl: "https://demo.produkx.id" }),
      adminId,
      db,
    );
    expect(r).toEqual({ ok: true, changed: true, message: "Pengaturan disimpan." });
    expect(getProductName(db)).toBe("Produk X");
    expect(getGithubConfig(db)?.repo).toBe("orang/produk-x");
    expect(getDemoStoreUrl(db)).toBe("https://demo.produkx.id/");
    const summaries = db.select().from(settingsHistory).all().map((h) => h.summary);
    expect(summaries).toEqual([
      "Nama produk: Lapaq ke Produk X",
      "Repo GitHub: (kosong) ke orang/produk-x",
      "URL toko demo: (kosong) ke https://demo.produkx.id/",
    ]);
    // Simpan ulang tanpa perubahan: tidak ada riwayat baru.
    expect(saveGeneralSettings(general({ productName: "Produk X", githubRepo: "orang/produk-x", demoStoreUrl: "https://demo.produkx.id/" }), adminId, db)).toMatchObject({ changed: false });
    expect(db.select().from(settingsHistory).all()).toHaveLength(3);
  });

  it("validasi: nama wajib dan maksimal 60 karakter, repo dan URL harus sah; tidak ada yang tersimpan", () => {
    for (const bad of [
      general({ productName: "  " }),
      general({ productName: "x".repeat(61) }),
      general({ githubRepo: "bukan repo" }),
      general({ demoStoreUrl: "javascript:alert(1)" }),
      general({ demoStoreUrl: "demo.tanpa.skema" }),
      general({ productName: 42 }),
    ]) {
      expect(saveGeneralSettings(bad, adminId, db).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(db.select().from(appSettings).all()).toEqual([]);
  });
});

describe("Token GitHub", () => {
  it("disimpan terenkripsi: nilai asli tidak ada di tabel mana pun, riwayat hanya menyebut akhiran", () => {
    const r = setGithubToken(TOKEN, adminId, db);
    expect(r).toMatchObject({ ok: true, last4: "WXYZ" });
    const row = db.select().from(appSettings).get()!;
    expect(row.githubTokenEncrypted).not.toContain(TOKEN);
    expect(row.githubTokenLast4).toBe("WXYZ");
    expect(historyText()).not.toContain(TOKEN.slice(0, 20));
    expect(db.select().from(settingsHistory).all().map((h) => h.summary)).toEqual(["Token GitHub diisi (akhiran …WXYZ)"]);

    saveGeneralSettings(general({ githubRepo: "a/b" }), adminId, db);
    expect(getGithubConfig(db)).toEqual({ repo: "a/b", token: TOKEN });
    expect(getSettingsView(db).token).toEqual({ source: "pengaturan", last4: "WXYZ" });
    // Tampilan untuk halaman tidak pernah memuat token.
    expect(JSON.stringify(getSettingsView(db))).not.toContain(TOKEN);
  });

  it("token Pengaturan mengalahkan GITHUB_TOKEN; setelah dihapus kembali ke lingkungan", () => {
    process.env.GITHUB_REPO = "a/b";
    process.env.GITHUB_TOKEN = "ghp_" + "e".repeat(36);
    setGithubToken(TOKEN, adminId, db);
    expect(getGithubConfig(db)?.token).toBe(TOKEN);
    expect(clearGithubToken(adminId, db).ok).toBe(true);
    expect(getGithubConfig(db)?.token).toBe(process.env.GITHUB_TOKEN);
    expect(getSettingsView(db).token).toEqual({ source: "lingkungan" });
    expect(clearGithubToken(adminId, db).ok).toBe(false);
    expect(db.select().from(settingsHistory).all().map((h) => h.summary)).toEqual([
      "Token GitHub diisi (akhiran …WXYZ)",
      "Token GitHub dihapus dari Pengaturan",
    ]);
  });

  it("tanpa SETTINGS_ENCRYPTION_KEY: token ditolak dan tidak ada yang tersimpan", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    const r = setGithubToken(TOKEN, adminId, db);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("SETTINGS_ENCRYPTION_KEY");
    expect(db.select().from(appSettings).all()).toEqual([]);
    expect(getSettingsView(db)).toMatchObject({ encryptionReady: false });
  });

  it("kunci berubah setelah token disimpan: token tidak dipakai dan halaman menjelaskan sebabnya", () => {
    process.env.GITHUB_REPO = "a/b";
    setGithubToken(TOKEN, adminId, db);
    process.env.SETTINGS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(getGithubConfig(db)).toEqual({ repo: "a/b", token: undefined });
    const status = getSettingsView(db).token;
    expect(status.source).toBe("pengaturan-rusak");
  });
});
