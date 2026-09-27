// Validasi alamat toko demo untuk tombol "Coba di toko demo". Nilainya diatur di Pengaturan
// (cadangan: DEMO_STORE_URL di lingkungan); lihat getDemoStoreUrl di lib/settings.ts.
// Nilai kosong atau tidak valid dianggap "tidak diset" supaya tombol tidak pernah tampil rusak.

/** Mengembalikan URL http/https yang sah, atau null bila kosong/tidak valid. */
export function parseDemoStoreUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.toString();
}
