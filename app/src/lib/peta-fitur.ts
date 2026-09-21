// Peta fitur awal: satu entri per butir fitur yang jelas dari audit/github-pr-audit.md, bagian 8,
// area A (toko pelanggan), B (admin penjual), C (modul add-on), dan D (situs publik dan domain
// kustom). Area E (superadmin) dan F (integrasi) sengaja tidak dimasukkan.
//
// Hanya judul dan Jenis yang diisi. Ringkasan, penjelasan, dan kolom lain dibiarkan kosong:
// isinya harus ditulis Admin, bukan dikarang di sini. Semua entri seed berstatus Internal,
// beraudiens Internal, dan belum terbit, jadi tidak terlihat oleh Marketing maupun Partner.
//
// Butir yang sengaja dilewati karena bukan fitur yang jelas: halaman syarat toko, dan halaman
// kebijakan privasi, refund, dan syarat di situs Lapaq (halaman hukum biasa).
import { asc, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries, users } from "@/db/schema";
import { logHistory, type Result } from "@/lib/admin-entries";
import type { Kind } from "@/lib/domain";
import { slugify } from "@/lib/slug";

export type PetaArea = "A" | "B" | "C" | "D";
export type PetaItem = { area: PetaArea; title: string; kind: Kind };

export const PETA_AREA_LABEL: Record<PetaArea, string> = {
  A: "Toko pelanggan",
  B: "Admin penjual",
  C: "Modul add-on",
  D: "Situs publik dan domain kustom",
};

const core = (area: PetaArea, titles: string[]): PetaItem[] =>
  titles.map((title) => ({ area, title, kind: "core" as const }));

export const PETA_FITUR: PetaItem[] = [
  // A. Toko pelanggan (storefront)
  ...core("A", [
    "Beranda toko",
    "Katalog produk",
    "Pencarian produk",
    "Halaman detail produk",
    "Keranjang belanja",
    "Checkout",
    "Pembayaran pesanan",
    "Ulasan pembeli",
    "Cek status pesanan",
    "Ongkos kirim reguler dan instan",
    "Pratinjau kupon",
    "Pendaftaran afiliasi",
    "Dasbor afiliasi",
    "Tautan afiliasi",
  ]),
  // B. Admin toko / penjual
  ...core("B", [
    "Dasbor penjual",
    "Onboarding toko",
    "Masuk dan pemulihan kata sandi penjual",
    "Produk fisik",
    "Produk digital",
    "Koleksi produk",
    "Impor produk",
    "Daftar dan detail pesanan",
    "Cetak struk dan resi",
    "Cetak label pengiriman",
    "Bukti transfer pesanan",
    "Kupon",
    "Voucher",
    "Retensi (kupon otomatis)",
    "Spotlight produk",
    "Pengelolaan afiliasi",
    "Moderasi ulasan",
    "Katalog dan pembelian add-on",
    "Paket langganan",
    "Perpanjangan langganan",
    "Dompet dan saldo",
    "Penarikan dana",
    "Konfigurasi toko dan pembayaran",
    "Kustomisasi tampilan toko",
    "Notifikasi penjual",
  ]),
  // C. Modul add-on
  ...[
    "Kunci stok",
    "Peringatan stok rendah",
    "Ulasan toko",
    "Jadwal toko",
    "Bilah pengumuman (ticker bar)",
    "Tautan media sosial",
  ].map((title) => ({ area: "C" as const, title, kind: "addon" as const })),
  // D. Situs publik Lapaq dan domain kustom
  ...core("D", [
    "Halaman utama Lapaq",
    "Pendaftaran merchant",
    "Inspirasi toko",
    "Blog Lapaq",
    "Changelog Lapaq",
    "Roadmap Lapaq",
    "Domain kustom toko",
  ]),
];

/**
 * Membuat entri untuk setiap butir peta fitur yang belum ada. Idempoten berdasarkan slug:
 * entri yang sudah ada tidak disentuh (isinya mungkin sudah disunting Admin).
 */
export function seedPetaFitur(
  db: AppDb = getDb(),
): Result<{ created: string[]; skipped: number }> {
  const admin = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.id))
    .get();
  if (!admin) {
    return { ok: false, error: "Belum ada akun Admin. Buat dulu dengan `npm run db:seed`." };
  }

  return db.transaction((tx) => {
    const created: string[] = [];
    let skipped = 0;
    const base = Date.now();
    PETA_FITUR.forEach((item, index) => {
      // Butir pertama dibuat paling "baru" supaya urutan di Inbox mengikuti urutan daftar.
      const at = new Date(base - index);
      const row = tx
        .insert(entries)
        .values({
          slug: slugify(item.title),
          title: item.title,
          kind: item.kind,
          nature: "new",
          status: "internal",
          audience: "internal",
          isPublished: false,
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing({ target: entries.slug })
        .returning({ id: entries.id })
        .get();
      if (row) {
        logHistory(tx, row.id, admin.id, "Membuat entri (peta fitur awal)", at);
        created.push(item.title);
      } else {
        skipped += 1;
      }
    });
    return { ok: true as const, created, skipped };
  });
}
