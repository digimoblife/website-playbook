# Validasi tebakan Jenis dari jalur file (Langkah 6b)

Per 28 September 2026. Menjawab pertanyaan terbuka terakhir di blueprint: apakah Jenis sebuah perubahan (Fitur inti atau Add-on) bisa ditebak dari jalur file sebelum fase 2 berjalan.

## Cara pemeriksaan

- Repositori `bajaklautmalaka/lapaq` dibaca **hanya-baca** lewat `git clone` ke folder sementara, dengan fine-grained token hanya-baca dari variabel lingkungan sesi. Tidak ada commit, branch, push, atau komentar ke repositori Lapaq.
- Keadaan repositori: HEAD `ccc22be` (28 September 2026), 182 commit (157 bukan merge), 704 file.
- Yang dibaca hanya nama file dan judul commit. Isi kode tidak dikutip di sini. Tidak ditemukan rahasia atau data pelanggan di judul commit yang dikutip.
- Acuan "benar": peta fitur awal (`app/src/lib/peta-fitur.ts`, dari audit bagian 8). Ada 6 add-on: Kunci stok, Peringatan stok rendah, Ulasan toko, Jadwal toko, Bilah pengumuman (ticker), dan Tautan media sosial. "Katalog dan pembelian add-on" termasuk **Fitur inti** (area B).
- Setiap commit yang ditandai dinilai manual dari judul dan daftar filenya. Penilaian ini bisa keliru di beberapa commit campuran; angka di bawah adalah perkiraan, bukan ukuran pasti.

## Jawaban singkat

**Aturan di blueprint sekarang tidak akurat.** Aturan "perubahan di `src/services/add-ons` atau komponen add-on menjadi kandidat add-on" menandai 21 commit, dan hanya sekitar 4 di antaranya yang benar tentang add-on tertentu (sekitar 20 persen). Aturan itu juga melewatkan setidaknya satu commit add-on yang jelas.

Jenis sebaiknya **diambil dari peta fitur lewat trailer `Fitur:`**. Jalur file dan judul hanya menjadi tebakan cadangan yang lebih sempit, dan Admin tetap yang memutuskan.

## Temuan

### 1. Jalur "add-on" juga dipakai sistem add-on, bukan hanya fitur add-on

Folder dan file berjudul add-on memuat dua hal yang berbeda Jenis:

| Isi | Contoh jalur | Jenis menurut peta fitur |
| --- | --- | --- |
| Layanan keenam add-on | `src/services/add-ons/stock-lock.ts`, `low-stock-alerts.ts`, `store-reviews.ts`, `store-schedule.ts`, `ticker-bar.ts`, `social-media.ts` | Add-on |
| Sistem add-on: hak akses, definisi, penagihan, versi | `src/services/add-ons/access.ts`, `definitions.ts`, `billing.ts`, `entitlements.ts`, `releases.ts` | Fitur inti (Katalog dan pembelian add-on) |
| Halaman katalog, detail, dan pembayaran add-on untuk penjual | `src/app/[storeSlug]/admin/add-ons/...` | Fitur inti |
| Pengelolaan add-on oleh superadmin | `src/app/superadmin/add-ons/...`, `src/components/superadmin/add-on-*` | Internal Lapaq (area E), bukan untuk marketing |

`releases.ts` dan `billing.ts` juga sering ikut tersentuh oleh perubahan yang tidak berhubungan (notifikasi, domain kustom, analitik), sehingga menambah salah tebak.

### 2. Tampilan setiap add-on tersebar di halaman inti

Kode tampilan add-on tidak berada di folder add-on:

| Add-on | Jumlah file di luar `src/services/add-ons` | Contoh |
| --- | --- | --- |
| Kunci stok | 17 | form produk, halaman produk toko |
| Peringatan stok rendah | 26 | konfigurasi toko, detail pesanan, notifikasi |
| Ulasan toko | 17 | halaman ulasan, detail pesanan |
| Jadwal toko | 9 | konfigurasi toko, `store-chrome` |
| Ticker | 10 | konfigurasi toko, `store-chrome`, `ticker-text-input` |
| Media sosial | 10 | konfigurasi toko, `store-chrome` |

Akibatnya perubahan add-on yang hanya menyentuh halaman inti tidak tertangkap, misalnya `2be1679` "feat: add themed storefront ticker" (hanya `src/app/[storeSlug]/page.tsx` dan `globals.css`).

Batas "Ulasan toko" (add-on) dengan "Ulasan pembeli" dan "Moderasi ulasan" (inti) juga kabur di kodenya sendiri, karena berbagi halaman ulasan yang sama. Pemisahannya perlu diputuskan Admin di peta fitur, bukan ditebak dari jalur.

### 3. Hasil tiga aturan pada 157 commit

| Aturan | Ditandai add-on | Benar tentang add-on tertentu (perkiraan) | Terlewat yang diketahui |
| --- | --- | --- | --- |
| A. Blueprint sekarang: jalur mengandung add-on | 21 | sekitar 4 | `2be1679` (ticker) |
| B. Hanya file layanan keenam add-on | 6 | 3 sampai 4 | `70e72f1`, `2be1679` |
| C. Nama add-on disebut di judul commit | 3 | 3 | tergantung kualitas judul |
| B atau C | 8 | 5 sampai 7 | belum ditemukan |

Commit yang ditandai aturan A, dikelompokkan menurut penilaian manual:

- **Benar tentang add-on tertentu:** `70e72f1` change addon stocklock from monthly to one time payment; `f17e0f5` update stock lock and paid subscribe add on; `69806cf` dan `8aeaae7` setting add ons and implementation.
- **Sistem add-on (inti) atau superadmin:** `c1e4806` adding versioning; `30fdc92` rich text editor; `a7a828c` add add-on setting; `ebb4a70` feat: refine storefront and add-on experiences (campuran); `5b093d9` Fix VPS billing redirects and add staging Pakasir simulation; `8b33151` Port remaining merchant and superadmin VPS flows to PostgreSQL.
- **Tidak berhubungan atau pemindahan infrastruktur, hanya ikut menyentuh file add-on:** `ccc22be`, `da72538`, `3153f8c`, `64b3b40` (posthog), `96d8381` (custom domain), `03d487d`, `102e42c`, `ec0ff12`, `c4056fa` (edge cache), dan `30ad9a9` (campuran notifikasi dan stok).

### 4. Format commit belum dipakai

- Trailer `Fitur:` belum muncul di commit mana pun (0 dari 182).
- 91 dari 157 judul commit tanpa tipe Conventional Commits. Yang bertipe: feat 25, fix 21, style 16, refactor 2, wip 1, chore 1.

Karena tim Lapaq sudah setuju memakai format commit, angka ini diperkirakan membaik. Validasi ini perlu diulang setelah format dipakai beberapa minggu.

## Rekomendasi untuk fase 2 (Langkah 6d)

1. **Jenis diambil dari peta fitur.** Commit atau PR dengan trailer `Fitur: slug` langsung memakai Jenis entri yang cocok di peta fitur. Ini sumber utama dan tidak bergantung pada jalur file.
2. **Tebakan cadangan diganti menjadi aturan B atau C:**
   - Add-on bila menyentuh salah satu file layanan add-on yang spesifik, **atau** judul commit atau PR menyebut nama add-on dari peta fitur.
   - Daftar file dan nama add-on diambil dari entri berjenis Add-on di peta fitur, bukan ditulis mati di kode, supaya add-on baru ikut terhitung.
   - Perubahan hanya di file sistem add-on (`access`, `definitions`, `billing`, `entitlements`, `releases`, halaman `admin/add-ons`) ditebak sebagai **Fitur inti** (Katalog dan pembelian add-on).
   - Perubahan hanya di `superadmin/add-ons` ditebak sebagai **Fitur inti** dengan keterangan "area superadmin (internal Lapaq)". Tetap masuk Inbox sebagai kandidat; Admin yang memutuskan apakah perlu entri Playbook.
3. **Perubahan pada `src/services/add-ons/definitions.ts` diberi tanda "mungkin ada add-on baru, periksa"**, karena add-on baru didaftarkan di sana. Webhook hanya menerima nama file, bukan isinya, jadi ini hanya bisa berupa tanda untuk Admin.
4. **Tebakan selalu ditampilkan sebagai tebakan** dan dikonfirmasi Admin di editor, sesuai blueprint.
5. **Ulangi validasi ini** setelah format commit dipakai sekitar satu bulan, dengan data PR (judul dan deskripsi) bila akses API GitHub tersedia.

## Keterbatasan

- Data PR (judul dan deskripsi) tidak diperiksa: jalur API GitHub diblokir proxy lingkungan sesi, sehingga hanya riwayat git yang dibaca.
- Penilaian "benar" dilakukan manual dari judul dan nama file tanpa membaca isi kode, dan commit campuran dinilai berdasarkan bagian terbesarnya.
- Sampel kecil (157 commit) dan sebagian besar commit belum memakai format yang disepakati.
