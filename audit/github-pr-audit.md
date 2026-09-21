# Audit Repositori GitHub Lapaq: PR, Label, Feature Flag, dan Penamaan

Tanggal audit: 21 September 2026
Repositori: `bajaklautmalaka/lapaq` (clone lokal `~/projects/lapaq`, hanya dibaca)
Cara kerja: hanya baca. Data dari `gh` (token fine-grained read-only) dan `git log` di clone. Tidak ada commit, push, atau perubahan di Lapaq. File `.env` dan rahasia tidak dibaca. Nama variabel konfigurasi dicatat, nilainya tidak.
Catatan rahasia: tidak ditemukan rahasia atau data pelanggan di deskripsi PR #1 sampai #7 maupun di pesan commit, jadi tidak ada nomor PR atau commit yang perlu ditandai.

## Ringkasan

Pertanyaan terbuka di blueprint: "Apakah tim developer Lapaq memakai label PR atau feature flag, dan seberapa rapi penamaan PR-nya?"

**Jawabannya: tidak dan belum rapi.** Alur "webhook merge PR, AI menulis draf" akan berjalan, tetapi dengan bahan yang miskin.

| Pertanyaan | Jawaban singkat |
| --- | --- |
| Label PR dipakai? | **Tidak.** 0 dari 7 PR berlabel. Label bawaan GitHub ada, tidak pernah dipakai. |
| Feature flag? | **Tidak ada sistem feature flag umum.** Hanya tiga saklar lingkungan untuk payment gateway dan mekanisme add-on per toko. Tidak ada tahap Beta. |
| Nama PR rapi? | **Campur.** Dua judul otomatis dari Codex, satu judul satu kata, dua judul gaya `feat:`. |
| Deskripsi PR? | **4 dari 7 kosong** (#1, #2, #3, #6). Tiga lainnya (#4, #5, #7) informatif. |
| Rilis atau tag? | **Tidak ada.** 0 Release, 0 tag. |
| Commit langsung ke main? | **Dominan.** 62 commit langsung, dibanding 7 PR. |

Tiga temuan yang paling mengubah rencana:
1. **PR bukan satuan fitur yang andal.** Sebagian besar pekerjaan masuk lewat commit langsung ke `main`, yang tidak memicu webhook "merge PR". Termasuk fitur besar seperti custom domain.
2. **Lapaq sudah punya changelog dan roadmap publik sendiri** (`/changelog`, `/roadmap`) dengan tabel CMS dan status draft/published. Ini tumpang tindih dengan "Apa yang baru" di Playbook, sekaligus bisa jadi sumber data.
3. **Tidak ada padanan status Beta** di Lapaq, jadi status Internal/Beta/Siap diumumkan harus dimiliki Playbook sendiri.

## 1. Label PR

- Repo punya sembilan label bawaan GitHub: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`. Tidak ada label buatan tim.
- **PR #1 sampai #7: semuanya tanpa label.**
- Konsekuensi untuk triase (fitur / bug kecil / refactor): label tidak bisa dipakai. Triase harus sepenuhnya ditebak AI dari judul, deskripsi, dan daftar file.
- Peluang: `enhancement` dan `bug` sudah ada. Cukup kebiasaan memakainya, tanpa mengubah konfigurasi repo.

Rekomendasi: minta developer memakai minimal tiga label (mis. `enhancement`, `bug`, dan satu untuk refactor/chore) pada setiap PR. Ini keputusan tim Lapaq; audit ini tidak mengubah apa pun di repo.

## 2. Feature flag

**Tidak ada sistem feature flag umum** (tanpa layanan flag, tanpa modul flag terpusat). Yang ditemukan:

| Mekanisme | Lokasi | Sifat | Bisa memetakan Internal/Beta/Siap? |
| --- | --- | --- | --- |
| `FASPAY_ENABLED`, `FASPAY_PAYOUT_ENABLED`, `FASPAY_ROUTE_PAYMENT_ENABLED` | `wrangler.toml` (per lingkungan: default, preview, production), `src/env.ts`, `src/services/faspay.ts` | Saklar lingkungan, khusus payment gateway | Tidak; hanya hidup/mati per lingkungan |
| `APP_ENV` | `wrangler.toml`, `src/env.ts` | Pembeda development/preview/production | Tidak |
| Katalog add-on: `is_listed`, `is_active`, `default_enabled_new_store`, `store_add_ons.merchant_enabled`, `admin_status`, `entitlement_status` | `src/db/schema.ts`, `src/services/add-ons/` | Pengaktifan fitur berbayar/opsional **per toko** | Sebagian: `is_listed` + `is_active` mirip "sudah dirilis ke merchant". Tidak ada tahap Beta |
| Versi add-on: `last_seen_version`, `add_on_release_views`, `releases.ts` (commit `c1e4806`) | `src/services/add-ons/releases.ts`, komponen `add-on-release-notes` | Catatan rilis per add-on untuk merchant | Tidak memetakan status, tapi ada versi dan catatan rilis |
| Saklar pengaturan toko: `telegram_enabled`, `affiliate_enabled`, `retention_auto_coupon_enabled`, dll. | `src/db/schema.ts` | Preferensi merchant, bukan tahap rilis | Tidak |
| CMS changelog: `status` (draft/published), `version`, `released_at` | tabel `cms_changelog_entries`, halaman `/changelog` | Konten, bukan flag | Sebagian: published ≈ Siap diumumkan; draft ≈ Internal |
| CMS roadmap: `stage` (planned/next/in_progress), `status` (draft/published) | tabel `cms_roadmap_items`, halaman `/roadmap` | Konten, bukan flag | Sebagian: in_progress ≈ belum siap. Tidak ada Beta |

Kesimpulan: **tidak ada satu pun sumber yang menyatakan "fitur ini Beta".** Status Internal/Beta/Siap diumumkan harus tetap dimiliki dan diputuskan Admin di Playbook, sesuai blueprint. Jangan bergantung pada flag Lapaq.

Rekomendasi:
- Pertahankan status Playbook sebagai sumber kebenaran; default Internal sudah tepat.
- Sebagai bantuan (opsional), sinyal `add_ons.is_listed/is_active` dan status changelog `published` bisa dijadikan petunjuk kepada Admin, bukan penentu.
- Buka diskusi dengan tim Lapaq: apakah akan ada label PR seperti `beta`? Label lebih murah daripada membangun sistem flag.

## 3. Kerapian penamaan PR dan deskripsi

| Aspek | Temuan |
| --- | --- |
| Konsistensi judul | Rendah. Empat gaya berbeda dalam tujuh PR (lihat tabel di bawah). |
| Bahasa | Judul memakai bahasa Inggris, deskripsi (bila ada) memakai bahasa Indonesia. |
| Struktur deskripsi | Deskripsi yang ada memakai pola konsisten "Ringkasan" + "Verifikasi/Pengujian". Ini bagus dan mudah dipakai AI. |
| Judul otomatis | PR #2 dan #3 berjudul bawaan Codex ("Codex/..."), tanpa arti bagi pembaca non-teknis. |
| Nama branch | Branch `codex/admin-dashboard-redesign` dipakai ulang untuk empat PR (#4 sampai #7), jadi nama branch tidak menggambarkan isi PR. |
| Kelayakan sebagai bahan draf AI | **Cukup untuk #4, #5, #7. Kurang untuk #1, #2, #3, #6** (deskripsi kosong; AI hanya punya judul dan daftar file). |

Contoh judul (nomor dan judul saja):
- Otomatis/tidak bermakna: #2 "Codex/cms video faq integration", #3 "Codex/storefront landing refresh"
- Satu kata: #1 "Onboarding"
- Deskriptif tanpa prefiks: #4 "Refresh seller admin dashboard", #5 "Storefront polish and connected blog pages"
- Gaya `feat:`: #6 "feat: refine storefront and add-on experiences", #7 "feat: enhance storefront catalog, search, wallet, and dashboard"

Rekomendasi: minta tim Lapaq menyeragamkan judul (satu gaya, mis. `feat:`/`fix:`) dan **selalu mengisi deskripsi** dengan pola "Ringkasan" yang sudah dipakai di #4, #5, #7. Sesuai blueprint, "nama PR dirapikan oleh developer" adalah mitigasi yang sudah direncanakan; audit ini mengonfirmasi perlunya.

## 4. Rilis dan tag

- **GitHub Releases: tidak ada** (0).
- **Tag versi git: tidak ada** (0).
- `package.json` memakai versi `0.1.0` dan tidak berubah sebagai penanda rilis.
- Ada versi di tingkat add-on (`last_seen_version`, default `0.0.1`) dan versi pada entri CMS changelog. Ini bukan rilis repo.

Konsekuensi: webhook "release" di blueprint tidak akan pernah terpicu saat ini. Satu-satunya pemicu yang ada adalah merge PR, ditambah push langsung ke `main`.

Rekomendasi: jika ingin satuan "rilis", minta tim membuat tag atau GitHub Release berkala. Kalau tidak, andalkan PR sebagai satuan dan tangani push langsung (bagian 6).

## 5. Rincian PR #1 sampai #7

Semua PR dimerge (tidak ada yang ditutup tanpa merge) dan **tidak ada satu pun yang berlabel**.

| # | Judul | Status | Tanggal merge | Deskripsi | File berubah | Commit | Label |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Onboarding | Merged | 2026-07-27 | Kosong | 33 | 3 | Tidak |
| 2 | Codex/cms video faq integration | Merged | 2026-08-07 | Kosong | 24 | 4 | Tidak |
| 3 | Codex/storefront landing refresh | Merged | 2026-08-16 | Kosong | 33 | 5 | Tidak |
| 4 | Refresh seller admin dashboard | Merged | 2026-08-16 | Ada, informatif (ringkasan + verifikasi) | 5 | 18 | Tidak |
| 5 | Storefront polish and connected blog pages | Merged | 2026-08-24 | Ada, informatif | 11 | 4 | Tidak |
| 6 | feat: refine storefront and add-on experiences | Merged | 2026-08-28 | Kosong | 19 | 1 | Tidak |
| 7 | feat: enhance storefront catalog, search, wallet, and dashboard | Merged | 2026-09-15 | Ada, paling informatif (ringkasan + daftar tes) | 14 | 4 | Tidak |

Catatan:
- Deskripsi: **4 dari 7 kosong** (#1, #2, #3, #6); 3 informatif (#4, #5, #7).
- PR #4 hanya mengubah 5 file tetapi berisi 18 commit; jumlah file kecil tidak berarti perubahan kecil.
- Metode merge memakai merge commit (bukan squash), sehingga riwayat commit di dalam PR tetap terlihat.

## 6. Commit langsung ke main tanpa PR

- Total commit di `main`: **119** (104 non-merge + 15 merge).
- Merge dari PR: **7**. Merge lain (sinkronisasi branch, tanpa PR): **8**.
- Commit non-merge yang masuk langsung ke `main` (bukan lewat PR): **62**. Sisanya (sekitar 39) berada di dalam branch PR.
- Perbandingan: **62 commit langsung berbanding 7 PR**. Sebagian besar pekerjaan tidak melewati PR.
- Setelah PR terakhir (#7, 15 September), sudah ada 2 commit langsung: `f3366b3` dan `96d8381`; yang terakhir adalah fitur custom domain.

Kualitas pesan commit (dari 62 commit langsung):
- **28 (sekitar 45%) berisi tiga kata atau kurang**, mis. commit `03d487d`, `720f734`, `99967fb`, `ec0ff12`, `922215d`, `c1e4806`, `dcbb72f`, `d7b3fb2`.
- Hanya **2** yang memakai format `feat:`/`fix:`.
- Pesan kebanyakan bahasa Inggris pendek dan tidak menjelaskan manfaat bagi pengguna. Di seluruh commit non-merge, sekitar 31 dari 104 berformat konvensional (sebagian besar di dalam PR).

Konsekuensi: **webhook merge-PR saja akan melewatkan sebagian besar perubahan**, termasuk fitur besar (mis. `30ad9a9`, `365c688`, `96d8381`). Pesan commit tidak cukup informatif untuk draf AI.

Rekomendasi:
- Pilihan A (disarankan): minta tim mewajibkan PR untuk fitur, agar satuan perubahan jelas.
- Pilihan B: webhook juga memantau push ke `main`, dengan pengelompokan commit yang dibantu AI. Kualitasnya lebih rendah dan lebih banyak koreksi manual.
- Untuk tahap awal, kombinasikan: PR sebagai sumber utama, push langsung sebagai daftar "perlu ditinjau".

## 7. Ukuran perubahan: PR yang berisi banyak fitur

**Ya, satu PR sering berisi beberapa fitur berbeda.** Contoh PR #7 (14 file, 1.145 baris ditambah, 291 dihapus; judul dan deskripsinya sendiri memuat lima butir):

| Kandidat entri fitur | Bukti dari deskripsi dan file |
| --- | --- |
| Pencarian dan katalog storefront | Halaman baru `search/page.tsx`, `products/page.tsx`, `services/storefront.ts` |
| Penyempurnaan tampilan toko (navbar, ticker, footer, produk unggulan, keranjang/WhatsApp mengambang, notifikasi toko tidak aktif) | `components/storefront/*` |
| Rekomendasi add-on di dashboard admin | `admin/page.tsx`, `admin-dashboard-overview.tsx` |
| Ringkasan saldo tersedia/tertahan dan popup di menu penarikan | `admin/wallet/page.tsx` |
| Catatan pembeli pada pesanan | `services/orders.ts` |

Sebagian besar baris (656 dari 1.145) hanya penyesuaian gaya di `globals.css`, yang dipakai bersama semua butir. Jadi ukuran PR tidak mencerminkan jumlah fitur.

PR lain yang serupa: #5 (penyempurnaan tampilan + halaman blog), #6 (tampilan toko + add-on), #3 dan #1 (33 file masing-masing).

Rekomendasi:
- Jangan menganggap satu PR sama dengan satu entri fitur. Draf AI perlu **memecah satu PR menjadi beberapa usulan entri**, lalu Admin memilih. Ini menguatkan alur "Inbox, lalu kurasi PM" di blueprint dan risiko "satu commit tidak sama dengan satu fitur".
- Butir dalam daftar "Ringkasan" deskripsi PR (bila ada) adalah petunjuk pemecahan yang baik.
- Perubahan yang murni gaya (CSS, polesan tampilan) sebaiknya dipilah otomatis ke arsip.

## 8. Peta awal area produk (dari struktur route dan modul)

Sumber: 130 file `page.tsx`/`route.ts` di `src/app`, modul di `src/services` dan `src/components`. Ini hanya bahan awal peta fitur, belum divalidasi ke produk. Lapaq berjalan di Cloudflare (Workers, D1, R2) dengan Next.js.

**A. Toko pelanggan (storefront), `/[storeSlug]/...`**
- Beranda toko, katalog produk, pencarian, detail produk
- Keranjang, checkout, halaman pembayaran (termasuk transfer bank)
- Ulasan pembeli (tautan ulasan)
- Cek status pesanan, hitung ongkir (reguler dan instan), pratinjau kupon
- Halaman syarat
- Program afiliasi: daftar, login, verifikasi, dasbor afiliasi, tautan afiliasi

**B. Admin toko / seller, `/[storeSlug]/admin/...`**
- Dasbor, onboarding, login, lupa/ganti password
- Produk: fisik dan digital, tambah/ubah, koleksi, impor produk (berbayar)
- Pesanan: daftar, detail, cetak resi/struk, cetak label pengiriman, bukti transfer
- Promosi: kupon, voucher, retensi (kupon otomatis), spotlight, afiliasi
- Ulasan
- Add-on: katalog, detail, checkout dan pembayaran add-on
- Langganan: paket, checkout, perpanjang, status pembayaran
- Keuangan: dompet/saldo, penarikan
- Pengaturan: konfigurasi (termasuk pembayaran), kustomisasi tampilan, notifikasi (termasuk push)

**C. Modul add-on (dari `src/services/add-ons`)**
- Kunci stok (stock lock), peringatan stok rendah, ulasan toko, jadwal toko, ticker bar, media sosial

**D. Pendaftaran dan situs publik Lapaq**
- Beranda/landing, daftar merchant, inspirasi toko (galeri)
- Blog, changelog, roadmap (dengan suara dan komentar)
- Kebijakan privasi, refund, syarat
- Domain kustom toko dan halaman "domain tidak ditemukan"

**E. Superadmin (internal Lapaq), `/superadmin/...`**
- Toko, add-on, paket langganan, gateway pembayaran, transaksi, penarikan dompet
- CMS: blog, changelog, roadmap, galeri toko, testimoni, template tema, notifikasi

**F. Integrasi dan latar belakang**
- Pembayaran: Pakasir (webhook pembayaran, langganan, QRIS sistem) dan Faspay
- Notifikasi: Telegram (webhook), push (Firebase), email, OTP (email dan penarikan)
- Cron langganan, penyelesaian saldo (wallet settlement)

Catatan untuk Playbook:
- Area **A** dan **B** adalah inti panduan untuk marketing dan partner; **C** sudah berbentuk "fitur" yang jelas.
- Area **E** (superadmin) dan **F** (integrasi) kemungkinan **tidak boleh ada di panduan** untuk partner dan marketing. Tandai Internal secara default; ini sejalan dengan aturan draf berstatus Internal.
- Area **D** (changelog dan roadmap publik) sudah dipublikasikan Lapaq; tentukan apakah Playbook menautkan, menyalin, atau mengimpornya.

## Rekomendasi gabungan

**Untuk tim Lapaq** (keputusan mereka; Playbook tidak mengubah repo):
1. Pakai label PR (`enhancement`, `bug`, dan satu untuk refactor/chore).
2. Seragamkan judul PR dan **selalu isi deskripsi** dengan pola "Ringkasan" dan "Verifikasi".
3. Wajibkan PR untuk fitur; kurangi commit langsung ke `main`.
4. (Opsional) Tag versi atau GitHub Release berkala.

**Untuk desain Playbook:**
1. Status Internal/Beta/Siap diumumkan dimiliki Playbook; jangan menurunkannya dari flag Lapaq.
2. Draf AI harus memecah satu PR menjadi beberapa usulan fitur, dan tetap berguna saat deskripsi kosong (memakai judul, daftar file, dan ringkasan perubahan; tetap tanpa seluruh kode).
3. Triase tidak bisa mengandalkan label; mulai dengan tebakan AI yang dikoreksi Admin, dan biasakan koreksi rutin di awal (sesuai blueprint).
4. Tambahkan pemicu untuk push langsung ke `main` di samping webhook merge PR, atau sepakati dulu aturan PR-wajib.
5. Manfaatkan changelog dan roadmap Lapaq yang sudah ada sebagai sumber pembanding, dan putuskan hubungannya dengan halaman "Apa yang baru".

## Catatan tambahan (di luar pertanyaan audit)

- `.gitignore` di Lapaq hanya mengabaikan `.dev.vars`, tidak mengabaikan `.env*`. Tidak ada file `.env` yang ter-track saat ini. Ini bisa diteruskan ke tim Lapaq sebagai saran kebersihan repo.
- Tiga branch `codex/*` di remote sudah sepenuhnya berada di dalam `main` (tidak ada commit yang belum dimerge).
- README Lapaq tidak dibaca menyeluruh (memuat bagian akun superadmin); hanya judul bagian yang dilihat.
- Data issue tidak dapat dibaca karena token tidak punya izin issues; tidak dibutuhkan untuk audit ini.
- Pertanyaan blueprint yang terjawab: label PR dan feature flag (tidak ada), kerapian penamaan PR (belum rapi). Perlu diperbarui di dokumen Blueprint asli di Claude Docs.
