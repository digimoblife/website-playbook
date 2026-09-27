// Pengaturan instalasi (Langkah 6a): nama produk, repo GitHub, token GitHub, dan URL toko demo.
//
// Satu instalasi = satu produk. Produk lain memakai instalasi terpisah (database, domain, dan
// layanan sendiri) dari kode yang sama; lihat app/README.md.
//
// Urutan nilai yang berlaku: isian di Pengaturan, lalu variabel lingkungan lama (GITHUB_REPO,
// GITHUB_TOKEN, DEMO_STORE_URL) supaya instalasi yang sudah berjalan tidak berubah perilaku.
//
// Token GitHub:
//  - disimpan terenkripsi (lib/secret-box.ts); nilai aslinya tidak pernah dikirim ke browser,
//    ditulis ke riwayat, atau dicetak ke log. Yang ditampilkan hanya empat karakter terakhir.
//  - hanya bisa diganti atau dihapus, tidak bisa "dilihat".
//
// Fungsi tulis di sini TIDAK memeriksa siapa pemanggilnya; pemeriksaan Admin ada di setiap
// Server Action (app/admin/pengaturan/actions.ts).
import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { appSettings, settingsHistory, users } from "@/db/schema";
import { oneLine, type DbLike, type Result } from "@/lib/admin-entries";
import { parseDemoStoreUrl } from "@/lib/demo-store";
import type { GithubConfig } from "@/lib/github-api";
import { decryptSecret, encryptionKey, encryptSecret } from "@/lib/secret-box";

const fail = (error: string) => ({ ok: false as const, error });

export const DEFAULT_PRODUCT_NAME = "Lapaq";
export const PRODUCT_NAME_MAX = 60;

// ---------- Validasi (murni) ----------

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Menerima "pemilik/repo" atau URL GitHub (https://github.com/pemilik/repo, boleh diakhiri .git
 * atau garis miring). Mengembalikan bentuk baku "pemilik/repo", atau galat.
 */
export function parseGithubRepo(input: string): Result<{ repo: string }> {
  let value = input.trim();
  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  if (url) value = url[1];
  value = value.replace(/\/+$/, "").replace(/\.git$/i, "");
  const parts = value.split("/");
  if (parts.length !== 2) {
    return fail("Repo GitHub harus berbentuk pemilik/repo atau https://github.com/pemilik/repo.");
  }
  const [owner, repo] = parts;
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    return fail("Nama pemilik atau repo GitHub tidak valid.");
  }
  return { ok: true, repo: `${owner}/${repo}` };
}

/** Token GitHub: tanpa spasi, hanya huruf, angka, dan garis bawah (ghp_…, github_pat_…). */
export function validateGithubToken(input: unknown): Result<{ token: string }> {
  if (typeof input !== "string") return fail("Token tidak valid.");
  const token = input.trim();
  if (!token) return fail("Token GitHub wajib diisi.");
  if (!/^[A-Za-z0-9_]{20,255}$/.test(token)) {
    return fail("Token GitHub tidak valid. Salin ulang dari GitHub (hanya huruf, angka, dan garis bawah).");
  }
  return { ok: true, token };
}

// ---------- Membaca ----------

type Row = typeof appSettings.$inferSelect;

function readRow(db: DbLike): Row | undefined {
  return db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
}

export type TokenStatus =
  | { source: "pengaturan"; last4: string }
  | { source: "pengaturan-rusak"; last4: string; error: string }
  | { source: "lingkungan" }
  | { source: "tidak-ada" };

export type SettingsView = {
  productName: string;
  /** Isian di Pengaturan (bisa kosong). */
  githubRepoSetting: string | null;
  /** Repo yang benar-benar dipakai, beserta asalnya. */
  githubRepo: string | null;
  githubRepoSource: "pengaturan" | "lingkungan" | "tidak-ada";
  token: TokenStatus;
  /** Apakah kunci enkripsi tersedia (syarat menyimpan token dari Pengaturan). */
  encryptionReady: boolean;
  encryptionError: string | null;
  demoStoreUrlSetting: string | null;
  demoStoreUrl: string | null;
  demoStoreUrlSource: "pengaturan" | "lingkungan" | "tidak-ada";
  updatedAt: Date | null;
};

function envRepo(): string | null {
  const raw = process.env.GITHUB_REPO?.trim();
  if (!raw) return null;
  const parsed = parseGithubRepo(raw);
  return parsed.ok ? parsed.repo : null;
}

function resolveToken(row: Row | undefined): { token: string | undefined; status: TokenStatus } {
  if (row?.githubTokenEncrypted) {
    const last4 = row.githubTokenLast4 ?? "????";
    const key = encryptionKey();
    if (!key.ok) return { token: undefined, status: { source: "pengaturan-rusak", last4, error: key.error } };
    const token = decryptSecret(row.githubTokenEncrypted, key.key);
    if (token === null) {
      return {
        token: undefined,
        status: {
          source: "pengaturan-rusak",
          last4,
          error: "Token tersimpan tidak bisa dibuka. Kemungkinan SETTINGS_ENCRYPTION_KEY berubah; simpan ulang tokennya.",
        },
      };
    }
    return { token, status: { source: "pengaturan", last4 } };
  }
  const env = process.env.GITHUB_TOKEN?.trim();
  return env ? { token: env, status: { source: "lingkungan" } } : { token: undefined, status: { source: "tidak-ada" } };
}

export function getSettingsView(db: AppDb = getDb()): SettingsView {
  const row = readRow(db);
  const repoEnv = envRepo();
  const demoSetting = row?.demoStoreUrl ?? null;
  const demoEnv = parseDemoStoreUrl(process.env.DEMO_STORE_URL);
  const key = encryptionKey();
  return {
    productName: row?.productName || DEFAULT_PRODUCT_NAME,
    githubRepoSetting: row?.githubRepo ?? null,
    githubRepo: row?.githubRepo ?? repoEnv,
    githubRepoSource: row?.githubRepo ? "pengaturan" : repoEnv ? "lingkungan" : "tidak-ada",
    token: resolveToken(row).status,
    encryptionReady: key.ok,
    encryptionError: key.ok ? null : key.error,
    demoStoreUrlSetting: demoSetting,
    demoStoreUrl: demoSetting ?? demoEnv,
    demoStoreUrlSource: demoSetting ? "pengaturan" : demoEnv ? "lingkungan" : "tidak-ada",
    updatedAt: row?.updatedAt ?? null,
  };
}

/**
 * Repo dan token yang dipakai server untuk memanggil GitHub. Token HANYA untuk server; jangan
 * pernah dikirim ke komponen klien atau dicetak.
 */
export function getGithubConfig(db: AppDb = getDb()): GithubConfig | null {
  const row = readRow(db);
  const repo = row?.githubRepo ?? envRepo();
  if (!repo) return null;
  return { repo, token: resolveToken(row).token };
}

/**
 * Nama produk untuk tampilan (navbar, sidebar, login, judul halaman). Tidak pernah melempar
 * galat: bila database belum siap (mis. sebelum migrasi), nama bawaan yang dipakai.
 */
export function getProductName(db?: AppDb): string {
  try {
    return readRow(db ?? getDb())?.productName || DEFAULT_PRODUCT_NAME;
  } catch {
    return DEFAULT_PRODUCT_NAME;
  }
}

/** URL toko demo yang sah, atau null (tombol "Coba di toko demo" disembunyikan). */
export function getDemoStoreUrl(db?: AppDb): string | null {
  try {
    const setting = readRow(db ?? getDb())?.demoStoreUrl;
    if (setting) return parseDemoStoreUrl(setting);
  } catch {
    // Jatuh ke variabel lingkungan.
  }
  return parseDemoStoreUrl(process.env.DEMO_STORE_URL);
}

export type SettingsHistoryRow = { id: number; at: Date; summary: string; userName: string };

export function listSettingsHistory(limit = 30, db: AppDb = getDb()): SettingsHistoryRow[] {
  return db
    .select({ id: settingsHistory.id, at: settingsHistory.at, summary: settingsHistory.summary, userName: users.name })
    .from(settingsHistory)
    .innerJoin(users, eq(users.id, settingsHistory.userId))
    .orderBy(desc(settingsHistory.at), desc(settingsHistory.id))
    .limit(limit)
    .all();
}

// ---------- Menulis ----------

function upsert(tx: DbLike, values: Partial<Omit<Row, "id">>, now: Date): void {
  tx.insert(appSettings)
    .values({ id: 1, ...values, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.id, set: { ...values, updatedAt: now } })
    .run();
}

function log(tx: DbLike, userId: number, summary: string, at: Date): void {
  tx.insert(settingsHistory).values({ userId, summary, at }).run();
}

const show = (value: string | null) => value ?? "(kosong)";

/** Menyimpan nama produk, repo GitHub, dan URL toko demo. Token punya fungsi sendiri. */
export function saveGeneralSettings(
  raw: { productName: unknown; githubRepo: unknown; demoStoreUrl: unknown },
  actorId: number,
  db: AppDb = getDb(),
): Result<{ changed: boolean; message: string }> {
  const productName = oneLine(raw.productName);
  if (!productName) return fail("Nama produk wajib diisi.");
  if (productName.length > PRODUCT_NAME_MAX) return fail(`Nama produk maksimal ${PRODUCT_NAME_MAX} karakter.`);

  const repoInput = oneLine(raw.githubRepo);
  if (repoInput === null) return fail("Repo GitHub tidak valid.");
  let githubRepo: string | null = null;
  if (repoInput) {
    const parsed = parseGithubRepo(repoInput);
    if (!parsed.ok) return parsed;
    githubRepo = parsed.repo;
  }

  const demoInput = oneLine(raw.demoStoreUrl);
  if (demoInput === null) return fail("URL toko demo tidak valid.");
  let demoStoreUrl: string | null = null;
  if (demoInput) {
    demoStoreUrl = parseDemoStoreUrl(demoInput);
    if (!demoStoreUrl) return fail("URL toko demo harus diawali http:// atau https:// dan berupa alamat yang sah.");
  }

  return db.transaction((tx) => {
    const current = readRow(tx);
    const before = {
      productName: current?.productName || DEFAULT_PRODUCT_NAME,
      githubRepo: current?.githubRepo ?? null,
      demoStoreUrl: current?.demoStoreUrl ?? null,
    };
    const now = new Date();
    const changes: string[] = [];
    if (before.productName !== productName) changes.push(`Nama produk: ${before.productName} ke ${productName}`);
    if (before.githubRepo !== githubRepo) changes.push(`Repo GitHub: ${show(before.githubRepo)} ke ${show(githubRepo)}`);
    if (before.demoStoreUrl !== demoStoreUrl) {
      changes.push(`URL toko demo: ${show(before.demoStoreUrl)} ke ${show(demoStoreUrl)}`);
    }
    if (changes.length === 0) return { ok: true as const, changed: false, message: "Tidak ada perubahan untuk disimpan." };

    upsert(tx, { productName, githubRepo, demoStoreUrl }, now);
    for (const change of changes) log(tx, actorId, change, now);
    return { ok: true as const, changed: true, message: "Pengaturan disimpan." };
  });
}

export function setGithubToken(
  raw: unknown,
  actorId: number,
  db: AppDb = getDb(),
): Result<{ message: string; last4: string }> {
  const valid = validateGithubToken(raw);
  if (!valid.ok) return valid;
  const key = encryptionKey();
  if (!key.ok) return fail(key.error);

  const last4 = valid.token.slice(-4);
  const sealed = encryptSecret(valid.token, key.key);
  return db.transaction((tx) => {
    const now = new Date();
    const hadToken = Boolean(readRow(tx)?.githubTokenEncrypted);
    upsert(tx, { githubTokenEncrypted: sealed, githubTokenLast4: last4 }, now);
    log(tx, actorId, `Token GitHub ${hadToken ? "diganti" : "diisi"} (akhiran …${last4})`, now);
    return { ok: true as const, message: `Token GitHub disimpan (akhiran …${last4}).`, last4 };
  });
}

export function clearGithubToken(actorId: number, db: AppDb = getDb()): Result<{ message: string }> {
  return db.transaction((tx) => {
    const current = readRow(tx);
    if (!current?.githubTokenEncrypted) return fail("Tidak ada token GitHub yang tersimpan di Pengaturan.");
    const now = new Date();
    upsert(tx, { githubTokenEncrypted: null, githubTokenLast4: null }, now);
    log(tx, actorId, "Token GitHub dihapus dari Pengaturan", now);
    return { ok: true as const, message: "Token GitHub dihapus dari Pengaturan." };
  });
}
