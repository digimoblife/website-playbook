// Skenario screenshot otomatis (Langkah 6e): pengurai dan validasi. Murni, tanpa browser.
//
// Satu perintah per baris; baris kosong dan baris yang diawali # diabaikan:
//   ukuran 390x844                  ukuran layar (opsional, sekali, di awal)
//   buka /produk/kaos               buka alamat di toko demo (hanya jalur, tidak boleh situs lain)
//   klik text=Tambah ke keranjang   klik elemen (selector Playwright: CSS atau text=...)
//   isi #email => ${DEMO_STORE_EMAIL}   isi kolom; nilai ${NAMA} diambil dari lingkungan server
//   tunggu .keranjang               tunggu elemen muncul, atau "tunggu 1500" (milidetik, maks 5000)
//   foto                            ambil screenshot halaman yang terlihat
//   foto .kartu-produk              ambil screenshot satu elemen
// Bukan kode: tidak ada JavaScript bebas yang bisa dijalankan dari skenario.

export const SCENARIO_LIMITS = {
  scriptChars: 4000,
  steps: 30,
  photos: 5,
  waitMs: 5000,
  argChars: 300,
} as const;

/** Hanya variabel berawalan DEMO_STORE_ yang boleh dipakai di skenario (mis. akun demo). */
export const SCENARIO_VAR = /\$\{(DEMO_STORE_[A-Z0-9_]+)\}/g;

export type ScenarioStep =
  | { op: "ukuran"; width: number; height: number; line: number }
  | { op: "buka"; path: string; line: number }
  | { op: "klik"; selector: string; line: number }
  | { op: "isi"; selector: string; value: string; line: number }
  | { op: "tunggu"; selector: string | null; ms: number | null; line: number }
  | { op: "foto"; selector: string | null; key: string; line: number };

export type ParseResult = { ok: true; steps: ScenarioStep[] } | { ok: false; errors: string[] };

function validPath(path: string): boolean {
  // Jalur relatif di toko demo saja: diawali "/", bukan "//", tanpa skema atau spasi.
  return /^\/(?!\/)[^\s\\]*$/.test(path) && !/^\/[a-z][a-z0-9+.-]*:/i.test(path);
}

export function parseScenario(script: string): ParseResult {
  const errors: string[] = [];
  const steps: ScenarioStep[] = [];
  if (script.length > SCENARIO_LIMITS.scriptChars) {
    return { ok: false, errors: [`Skenario maksimal ${SCENARIO_LIMITS.scriptChars} karakter.`] };
  }
  let photos = 0;
  script.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text || text.startsWith("#")) return;
    const op = text.split(/\s+/, 1)[0];
    const rest = text.slice(op.length).trim();
    const fail = (message: string) => errors.push(`Baris ${line}: ${message}`);
    if (rest.length > SCENARIO_LIMITS.argChars) return fail(`isian maksimal ${SCENARIO_LIMITS.argChars} karakter.`);

    switch (op.toLowerCase()) {
      case "ukuran": {
        const m = rest.match(/^(\d{3,4})x(\d{3,4})$/);
        if (!m) return fail('tulis seperti "ukuran 390x844".');
        const [width, height] = [Number(m[1]), Number(m[2])];
        if (width < 320 || width > 1920 || height < 480 || height > 2000) return fail("ukuran di luar batas (320 sampai 1920 x 480 sampai 2000).");
        if (steps.length > 0) return fail("ukuran harus di baris pertama.");
        return void steps.push({ op: "ukuran", width, height, line });
      }
      case "buka":
        if (!validPath(rest)) return fail('buka hanya menerima jalur di toko demo yang diawali "/", mis. "buka /produk".');
        return void steps.push({ op: "buka", path: rest, line });
      case "klik":
        if (!rest) return fail("klik apa? Tulis selector-nya.");
        return void steps.push({ op: "klik", selector: rest, line });
      case "isi": {
        const [selector, ...valueParts] = rest.split("=>");
        if (!selector?.trim() || valueParts.length === 0) return fail('tulis seperti "isi #email => nilai".');
        return void steps.push({ op: "isi", selector: selector.trim(), value: valueParts.join("=>").trim(), line });
      }
      case "tunggu":
        if (/^\d+$/.test(rest)) {
          const ms = Number(rest);
          if (ms > SCENARIO_LIMITS.waitMs) return fail(`tunggu paling lama ${SCENARIO_LIMITS.waitMs} milidetik.`);
          return void steps.push({ op: "tunggu", selector: null, ms, line });
        }
        if (!rest) return fail("tunggu apa? Tulis selector atau angka milidetik.");
        return void steps.push({ op: "tunggu", selector: rest, ms: null, line });
      case "foto":
        photos += 1;
        if (photos > SCENARIO_LIMITS.photos) return fail(`maksimal ${SCENARIO_LIMITS.photos} foto per skenario.`);
        return void steps.push({ op: "foto", selector: rest || null, key: `foto-${photos}`, line });
      default:
        return fail(`perintah "${op}" tidak dikenal. Pakai ukuran, buka, klik, isi, tunggu, atau foto.`);
    }
  });
  if (errors.length === 0 && steps.length > SCENARIO_LIMITS.steps) errors.push(`Maksimal ${SCENARIO_LIMITS.steps} langkah.`);
  if (errors.length === 0 && steps.length > 0 && !steps.some((s) => s.op === "buka")) errors.push('Skenario perlu minimal satu "buka".');
  if (errors.length === 0 && steps.length > 0 && photos === 0) errors.push('Skenario perlu minimal satu "foto".');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, steps };
}

/**
 * Mengganti ${DEMO_STORE_...} dengan nilai dari lingkungan server. Variabel yang tidak ada membuat
 * skenario gagal dengan nama variabelnya saja (nilainya tidak pernah ditulis ke galat atau log).
 */
export function fillVariables(value: string, env: Record<string, string | undefined>): { ok: true; value: string } | { ok: false; missing: string } {
  let missing: string | null = null;
  const filled = value.replace(SCENARIO_VAR, (_all, name: string) => {
    const v = env[name];
    if (v === undefined || v === "") missing ??= name;
    return v ?? "";
  });
  return missing ? { ok: false, missing } : { ok: true, value: filled };
}
