// Memeriksa kontras teks >= 4.5:1 (WCAG AA) untuk pasangan warna di globals.css,
// dan >= 3:1 untuk batas kontrol dan fokus. Nilai dibaca dari blok :root supaya tes ini
// gagal bila seseorang mengubah token menjadi terlalu pucat.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");
const root = css.match(/:root\s*{([^}]*)}/)?.[1] ?? "";
const tokens = new Map<string, string>();
for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens.set(m[1], m[2]);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tok = (name: string) => {
  const v = tokens.get(name);
  if (!v) throw new Error(`Token --${name} tidak ditemukan di :root`);
  return v;
};

// [teks, latar, keterangan]
const TEXT_PAIRS: [string, string, string][] = [
  ["text", "bg", "teks di latar halaman"],
  ["text", "surface", "teks di kartu"],
  ["muted", "bg", "teks redup di latar halaman"],
  ["muted", "surface", "teks redup di kartu dan placeholder"],
  ["accent", "surface", "tautan di kartu"],
  ["accent", "bg", "tautan di latar halaman"],
  ["accent-dark", "surface", "tautan saat disorot"],
  ["on-accent", "accent", "teks tombol utama"],
  ["on-accent", "accent-dark", "teks tombol utama saat disorot"],
  ["accent-dark", "accent-tint", "label peran"],
  ["text", "accent-tint", "tombol sekunder saat disorot"],
  ["badge-internal-fg", "badge-internal-bg", "badge Internal"],
  ["badge-beta-fg", "badge-beta-bg", "badge Beta"],
  ["badge-siap-fg", "badge-siap-bg", "badge Siap diumumkan"],
  ["danger-fg", "danger-bg", "peringatan bahaya"],
  ["success-fg", "success-bg", "pesan sukses"],
  ["text", "success-bg", "kata sandi sementara"],
  ["sidebar-fg", "sidebar-bg", "teks sidebar"],
  ["sidebar-muted", "sidebar-bg", "menu sidebar"],
  ["sidebar-fg", "sidebar-hover", "menu sidebar saat disorot"],
  ["sidebar-muted", "sidebar-hover", "menu sidebar redup saat disorot"],
  ["on-accent", "accent", "menu sidebar aktif"],
];

// [warna, latar, keterangan]: komponen non-teks minimal 3:1
const NON_TEXT_PAIRS: [string, string, string][] = [
  ["control-border", "surface", "batas kolom isian"],
  ["accent", "bg", "cincin fokus di halaman"],
  ["accent", "surface", "cincin fokus di kartu"],
  ["sidebar-fg", "sidebar-bg", "cincin fokus di sidebar"],
];

describe("kontras warna", () => {
  it("membaca token dari globals.css", () => {
    expect(tokens.size).toBeGreaterThan(20);
    expect(tok("bg")).toBe("#f7f5f0");
    expect(tok("accent")).toBe("#0e6e5c");
  });

  it.each(TEXT_PAIRS)("teks --%s di atas --%s (%s) >= 4.5:1", (fg, bg) => {
    expect(ratio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("komponen --%s di atas --%s (%s) >= 3:1", (fg, bg) => {
    expect(ratio(tok(fg), tok(bg))).toBeGreaterThanOrEqual(3);
  });
});
