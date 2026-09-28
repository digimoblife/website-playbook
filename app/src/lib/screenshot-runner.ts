// Menjalankan skenario screenshot pada toko demo dengan Playwright (Langkah 6e).
//
// Keamanan:
//  - Hanya alamat toko demo (Pengaturan). Navigasi halaman utama ke situs lain dihentikan, dan
//    skenario gagal bila halaman berakhir di luar toko demo.
//  - Skenario bukan kode (lib/screenshot-scenario.ts). Nilai rahasia akun demo diambil dari
//    variabel ${DEMO_STORE_...} di lingkungan server, dan nilainya disamarkan dari pesan galat.
//  - Batas waktu per langkah dan untuk seluruh skenario; satu skenario berjalan pada satu waktu.
// Bila gagal, screenshot lama ditandai "gagal diperbarui" dan disembunyikan dari pembaca; tidak ada
// gambar lama yang tampil diam-diam.
import "server-only";
import { eq } from "drizzle-orm";
import { chromium, type Browser } from "playwright-core";
import { getDb, type AppDb } from "@/db/client";
import { entries, screenshotScenarios } from "@/db/schema";
import { logHistory, type Result } from "@/lib/admin-entries";
import { markAutoScreenshotsFailed, removeStaleAutoScreenshots, saveAutoScreenshot } from "@/lib/media";
import { fillVariables, parseScenario, type ScenarioStep } from "@/lib/screenshot-scenario";
import { getDemoStoreUrl } from "@/lib/settings";

const STEP_TIMEOUT_MS = 15_000;
const TOTAL_TIMEOUT_MS = 90_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export type RunOutcome = { status: "berhasil"; photos: number } | { status: "gagal"; error: string };

export type RunnerDeps = {
  /** Diganti tes. Bawaan: chromium.launch() dari playwright-core. */
  launch?: () => Promise<Browser>;
  env?: Record<string, string | undefined>;
  mediaDir?: string;
  now?: () => Date;
  /** Batas waktu per langkah (bawaan 15 detik); tes memakai nilai kecil. */
  stepTimeoutMs?: number;
};

let running = false;

function scrub(message: string, env: Record<string, string | undefined>): string {
  let out = message.split("\n")[0].slice(0, 300);
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("DEMO_STORE_") && value && value.length >= 3) out = out.split(value).join(`[${name}]`);
  }
  return out;
}

async function launchDefault(): Promise<Browser> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH?.trim() || undefined;
  return chromium.launch({ headless: true, executablePath });
}

async function runSteps(
  browser: Browser,
  base: URL,
  steps: ScenarioStep[],
  env: Record<string, string | undefined>,
  stepTimeoutMs: number,
): Promise<{ key: string; bytes: Uint8Array }[]> {
  const first = steps[0];
  const viewport = first?.op === "ukuran" ? { width: first.width, height: first.height } : DEFAULT_VIEWPORT;
  const context = await browser.newContext({ viewport, acceptDownloads: false, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(stepTimeoutMs);
    // Navigasi halaman utama ke luar toko demo dihentikan (aset seperti font dan gambar tetap boleh).
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        const target = new URL(request.url());
        if (target.origin !== base.origin) return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    const photos: { key: string; bytes: Uint8Array }[] = [];
    for (const step of steps) {
      const where = `Baris ${step.line}`;
      try {
        switch (step.op) {
          case "ukuran":
            break;
          case "buka":
            await page.goto(new URL(step.path, base).toString(), { waitUntil: "load", timeout: stepTimeoutMs });
            break;
          case "klik":
            await page.locator(step.selector).first().click();
            break;
          case "isi": {
            const filled = fillVariables(step.value, env);
            if (!filled.ok) throw new Error(`variabel ${filled.missing} belum diisi di lingkungan server`);
            await page.locator(step.selector).first().fill(filled.value);
            break;
          }
          case "tunggu":
            if (step.ms !== null) await page.waitForTimeout(step.ms);
            else await page.locator(step.selector!).first().waitFor({ state: "visible" });
            break;
          case "foto": {
            const bytes = step.selector
              ? await page.locator(step.selector).first().screenshot({ type: "png" })
              : await page.screenshot({ type: "png", fullPage: false });
            photos.push({ key: step.key, bytes: new Uint8Array(bytes) });
            break;
          }
        }
      } catch (error) {
        throw new Error(`${where} (${step.op}): ${error instanceof Error ? error.message : String(error)}`);
      }
      if (new URL(page.url()).origin !== base.origin && page.url() !== "about:blank") {
        throw new Error(`${where}: halaman keluar dari toko demo, skenario dihentikan.`);
      }
    }
    return photos;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Menjalankan skenario satu entri dan mencatat hasilnya. `actorId` null bila dijalankan skrip cron
 * (riwayat entri hanya ditulis bila ada Admin yang menjalankannya).
 */
export async function runScenario(
  entryId: number,
  actorId: number | null,
  db: AppDb = getDb(),
  deps: RunnerDeps = {},
): Promise<RunOutcome> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const scenario = db.select().from(screenshotScenarios).where(eq(screenshotScenarios.entryId, entryId)).get();

  const finish = async (outcome: RunOutcome, keepKeys: string[] | null): Promise<RunOutcome> => {
    if (outcome.status === "gagal") markAutoScreenshotsFailed(entryId, db);
    else if (keepKeys) await removeStaleAutoScreenshots(entryId, keepKeys, { dir: deps.mediaDir, db });
    db.update(screenshotScenarios)
      .set({
        lastRunAt: now(),
        lastStatus: outcome.status,
        lastError: outcome.status === "gagal" ? outcome.error : null,
      })
      .where(eq(screenshotScenarios.entryId, entryId))
      .run();
    if (actorId) {
      logHistory(
        db,
        entryId,
        actorId,
        outcome.status === "berhasil"
          ? `Screenshot otomatis diperbarui (${outcome.photos} foto)`
          : `Screenshot gagal diperbarui: ${outcome.error}`,
      );
    }
    return outcome;
  };

  if (!scenario || !scenario.script.trim()) return { status: "gagal", error: "Entri ini belum punya skenario." };
  const exists = db.select({ id: entries.id }).from(entries).where(eq(entries.id, entryId)).get();
  if (!exists) return { status: "gagal", error: "Entri tidak ditemukan." };

  const parsed = parseScenario(scenario.script);
  if (!parsed.ok) return finish({ status: "gagal", error: parsed.errors[0] }, null);
  const base = getDemoStoreUrl(db);
  if (!base) return finish({ status: "gagal", error: "URL toko demo belum diatur di Pengaturan." }, null);

  if (running) return { status: "gagal", error: "Skenario lain sedang berjalan. Coba lagi sebentar lagi." };
  running = true;
  let browser: Browser | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    browser = await (deps.launch ?? launchDefault)();
    const b = browser;
    const photos = await Promise.race([
      runSteps(b, new URL(base), parsed.steps, env, deps.stepTimeoutMs ?? STEP_TIMEOUT_MS),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`skenario melebihi ${TOTAL_TIMEOUT_MS / 1000} detik.`)), TOTAL_TIMEOUT_MS);
      }),
    ]);
    for (const photo of photos) {
      await saveAutoScreenshot({ entryId, key: photo.key, bytes: photo.bytes }, { dir: deps.mediaDir, db });
    }
    return await finish({ status: "berhasil", photos: photos.length }, photos.map((p) => p.key));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const friendly = /Executable doesn't exist|browserType\.launch/i.test(message)
      ? "Browser Chromium belum terpasang di server. Jalankan: npx playwright install chromium"
      : message;
    return await finish({ status: "gagal", error: scrub(friendly, env) }, null);
  } finally {
    clearTimeout(timer);
    running = false;
    await browser?.close().catch(() => {});
  }
}

/** Menyimpan teks skenario (tanpa menjalankannya). Galat format dikembalikan per baris. */
export function saveScenario(entryId: number, script: unknown, db: AppDb = getDb()): Result<{ warnings: string[] }> {
  if (typeof script !== "string") return { ok: false, error: "Skenario tidak valid." };
  const text = script.replace(/\r\n?/g, "\n").trim();
  const parsed = text ? parseScenario(text) : ({ ok: true, steps: [] } as const);
  if (!parsed.ok) return { ok: false, error: parsed.errors.join(" ") };
  const exists = db.select({ id: entries.id }).from(entries).where(eq(entries.id, entryId)).get();
  if (!exists) return { ok: false, error: "Entri tidak ditemukan." };
  const now = new Date();
  db.insert(screenshotScenarios)
    .values({ entryId, script: text, updatedAt: now })
    .onConflictDoUpdate({ target: screenshotScenarios.entryId, set: { script: text, updatedAt: now } })
    .run();
  // Peringatan (bukan galat): nilai yang tampak seperti kata sandi ditulis langsung di skenario.
  const plainSecret = parsed.steps.some(
    (step) => step.op === "isi" && /pass|sandi/i.test(step.selector) && !/^\$\{DEMO_STORE_[A-Z0-9_]+\}$/.test(step.value),
  );
  const warnings = plainSecret
    ? ["Kata sandi sebaiknya ditulis sebagai ${DEMO_STORE_PASSWORD}, bukan nilai asli, supaya tidak tersimpan di database."]
    : [];
  return { ok: true, warnings };
}

export function getScenario(entryId: number, db: AppDb = getDb()) {
  return db.select().from(screenshotScenarios).where(eq(screenshotScenarios.entryId, entryId)).get() ?? null;
}

/** Semua entri yang punya skenario (dipakai skrip cron). */
export function listScenarioEntryIds(db: AppDb = getDb()): number[] {
  return db
    .select({ entryId: screenshotScenarios.entryId, script: screenshotScenarios.script })
    .from(screenshotScenarios)
    .all()
    .filter((row) => row.script.trim())
    .map((row) => row.entryId);
}
