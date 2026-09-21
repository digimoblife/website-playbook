# Lapaq Playbook (aplikasi)

Website panduan produk Lapaq untuk tim marketing internal dan partner JV, dengan dashboard admin untuk Product Manager. Rancangan lengkap ada di `../docs/blueprint.md`.

**Status: Fase 1, Langkah 2 (dashboard admin).** Sudah ada: database, login dan peran, aturan akses konten, dan dashboard admin lengkap: Inbox, Semua entri, editor entri (isi, langkah bergambar, status, audiens, publish, tarik kembali, arsip), Arsip, Riwayat, unggah gambar manual, peta fitur awal, serta pengelolaan pengguna (buat, ubah, reset kata sandi, nonaktifkan). Belum ada: halaman website untuk pembaca (beranda, Apa yang baru, katalog, halaman fitur), pratinjau, screenshot otomatis, webhook GitHub, AI, dan deployment.

Teknologi: Next.js 16 (App Router, TypeScript), SQLite lewat Drizzle ORM, argon2id untuk kata sandi, Vitest untuk tes.

## Prasyarat

- Node.js 22 atau lebih baru
- npm

## Memasang

```bash
npm install
```

## Konfigurasi dan akun Admin pertama

Salin contoh konfigurasi, lalu isi `ADMIN_NAME`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` (minimal 12 karakter) di `.env.local`. Berkas `.env.local` tidak ikut git.

```bash
cp .env.example .env.local
```

Buat database, lalu buat akun Admin dari nilai tadi:

```bash
npm run db:migrate
npm run db:seed
```

Sudah punya database dari Langkah 1? Cukup jalankan `npm run db:migrate`. Migrasi Langkah 2 bersifat aditif (menambah dua kolom dan dua pemicu) dan tidak menghapus atau mengubah data yang ada.

Setelah seed berhasil, **hapus `ADMIN_PASSWORD` dari `.env.local`**. Seed aman dijalankan ulang: akun yang sudah ada tidak diubah, dan kata sandi tidak pernah dicetak.

## Peta fitur awal dan gambar

Isi Inbox dengan peta fitur awal (52 entri dari audit bagian 8, area A sampai D). Semuanya berstatus Internal, beraudiens Internal, dan belum terbit, jadi tidak terlihat oleh Marketing maupun Partner. Aman dijalankan berulang kali; entri yang sudah ada tidak disentuh.

**Aturan publish dan Inbox.** Entri yang tidak akan terlihat pembaca (status Internal, atau audiens Internal) **tidak bisa dipublish**: server menolak dengan pesan "Ubah status dan audiens dari Internal dulu, baru Publish. Untuk menyimpan tanpa menampilkan, pakai Simpan.", dan tombol Publish di editor nonaktif dengan alasan yang terlihat. Entri yang akan terlihat harus lengkap (Ringkasan, minimal satu langkah, Boleh dijanjikan, Jangan dijanjikan). Inbox berisi entri yang **belum terlihat oleh pembaca** dan belum diarsipkan; tombol Publish di Inbox hanya muncul untuk entri yang akan terlihat dan lengkap, jadi seluruh 52 entri peta fitur tampil tanpa tombol Publish sampai statusnya diubah.

```bash
npm run db:seed:peta
```

Gambar yang diunggah di editor disimpan di `data/media/` (di luar git) dengan nama acak, dan hanya dilayani lewat `/media/[id]` untuk pengguna yang berhak. Lokasinya bisa diubah dengan `MEDIA_DIR`. PNG, JPEG, dan WebP maksimal 5 MB, GIF maksimal 10 MB, maksimal 20 gambar per entri; SVG ditolak, dan jenis berkas ditentukan dari isinya, bukan dari nama atau ekstensi.

## Lupa kata sandi

- **Pengguna lain:** Admin membuka **Pengguna, Kelola**, lalu **Reset kata sandi**. Kata sandi sementara tampil sekali, semua sesi pengguna itu dicabut, dan ia wajib menggantinya saat masuk.
- **Admin sendiri:** jalankan `npm run admin:reset` di terminal server. Kata sandi baru ditanyakan tanpa menampilkan ketikan (atau diberikan lewat `ADMIN_NEW_PASSWORD`, dan `ADMIN_EMAIL` bila ada lebih dari satu Admin). Kata sandi tidak disimpan di berkas mana pun dan tidak dicetak; semua sesi Admin itu dicabut.

## Menjalankan

```bash
npm run dev
```

Buka http://localhost:3000 dan masuk sebagai Admin. **Uji lokal selalu memakai `npm run dev`.** Mode produksi (`npm run build` dan `npm run start`) hanya boleh diuji lewat HTTPS; jangan diuji lewat `http://` (lihat "Catatan untuk produksi"). Akun Marketing dan Partner dibuat di **Dashboard admin, menu Pengguna**: sistem menampilkan kata sandi sementara satu kali, dan pengguna wajib menggantinya saat masuk pertama kali. Akun bisa dinonaktifkan; akun nonaktif langsung keluar dari semua perangkat.

## Menjalankan tes dan pemeriksaan

```bash
npm test            # tes otomatis (Vitest)
npm run typecheck   # pemeriksaan tipe TypeScript
npm run lint        # ESLint
```

Semua tes memakai database SQLite di memori dan folder sementara; database dan gambar Anda tidak tersentuh. Yang terpenting: `access.test.ts` dan `entries-access.test.ts` (matriks 3 peran × 3 status × 3 audiens × terbit/draf, dan Partner tidak pernah menerima `cannot_promise`), `actions.test.ts` (setiap Server Action menolak selain Admin dan database tetap utuh), `routes.test.ts` dan `media.test.ts` (akses, unggah, dan path traversal gambar), `admin-entries.test.ts` (aturan publish, arsip, dan pemicu database).

## Aturan akses konten

Semua diatur di satu modul, `src/lib/access.ts`. Fitur baru (rute gambar, aturan publish) hanya memanggilnya dan tidak menduplikasi aturannya.

| Peran | Yang terlihat |
| --- | --- |
| Admin | Semua entri, termasuk draf |
| Marketing | Entri yang terbit, berstatus Beta atau Siap diumumkan, beraudiens Marketing atau Marketing dan Partner, lengkap dengan "Jangan dijanjikan" |
| Partner | Entri yang terbit, berstatus Beta atau Siap diumumkan, beraudiens Marketing dan Partner, **tanpa** "Jangan dijanjikan" |

Entri yang diarsipkan hanya terlihat oleh Admin dan tidak pernah terbit (dijaga oleh pemicu di database, bukan hanya di antarmuka). Gambar mengikuti aturan entri pemiliknya: Marketing dan Partner hanya bisa mengambil gambar entri yang boleh mereka lihat, dan "tidak ada" serta "tidak boleh" sama-sama menjawab 404. Untuk Partner, kolom `cannot_promise` tidak pernah dibaca dari database (`src/lib/entries.ts`), jadi tidak pernah sampai ke browser. Semua rute `/admin/*` hanya untuk Admin; pengguna lain dialihkan ke beranda. Setiap halaman dan server action memeriksa peran sendiri lewat `src/lib/dal.ts`, tidak hanya mengandalkan `src/proxy.ts`.

## Struktur

```
app/
├── src/
│   ├── app/            halaman, server action, dan rute (masuk, admin/*, media/[id])
│   ├── components/     navbar, sidebar admin, badge status, tombol aksi
│   ├── db/             skema Drizzle dan koneksi SQLite
│   ├── lib/            access (aturan akses), publish (aturan publish), admin-entries,
│   │                   entries (baca untuk pembaca), media, users, auth, password, dal, peta-fitur
│   └── proxy.ts        pengalihan awal ke /masuk bila tanpa cookie sesi
├── drizzle/            berkas migrasi (ikut git)
├── scripts/            migrate, seed-admin, seed-peta, admin-reset
├── tests/              tes Vitest
└── data/               database SQLite dan gambar di data/media (tidak ikut git)
```

## Mengubah skema database

Ubah `src/db/schema.ts`, lalu:

```bash
npm run db:generate   # membuat berkas migrasi baru di drizzle/ (commit berkas ini)
npm run db:migrate    # menerapkannya ke database
```

## Catatan untuk produksi (VPS)

- **Wajib HTTPS.** Di mode produksi cookie sesi bertanda `Secure` (ditentukan oleh `NODE_ENV === "production"` di `src/lib/session.ts`), sehingga login tidak berjalan lewat HTTP biasa. Karena itu mode produksi hanya boleh diuji lewat HTTPS, dan uji lokal memakai `npm run dev`. Perilaku browser berikut adalah **perkiraan, belum diuji**: Chrome dan Firefox mengecualikan `localhost` dan tetap menerima cookie itu; Safari tidak, sehingga login tampak berhasil tetapi cookie dibuang dan pengguna kembali ke `/masuk`; alamat LAN (mis. `http://192.168.x.x`) ditolak semua browser.
- **Hasil uji (21 September 2026):** `npm run build` lalu `npm run start` tanpa menyetel `NODE_ENV` secara manual menghasilkan cookie sesi dengan atribut `Secure`. Belum diuji dengan peluncur lain (pm2, Docker, build standalone); pemeriksaan dari alamat HTTPS sebenarnya tetap wajib di Langkah 4.
- **Di belakang tepat satu reverse proxy** (Nginx atau Caddy) yang menambahkan IP klien di ujung `X-Forwarded-For`, dan aplikasi tidak boleh bisa diakses langsung dari internet. Header itu dipakai untuk membatasi percobaan login (5 kegagalan per email dan IP, 30 per IP, dalam 15 menit). Pembatas ini mengandaikan **tepat satu** reverse proxy; tanpa proxy yang benar, batas ini bisa dihindari. Asumsi ini belum diuji dengan proxy sungguhan.
- **Syarat Langkah 4:** pemeriksaan atribut `Secure` pada cookie dan penanganan `X-Forwarded-For` (entri terakhir dipakai sebagai IP klien), keduanya dari alamat HTTPS sebenarnya lewat reverse proxy, harus dikerjakan di Langkah 4 sebelum aplikasi dianggap siap untuk produksi.
- Jalankan `npm run db:migrate` setiap kali menerapkan versi baru, sebelum `npm run start`.
- Database adalah berkas `data/playbook.db` (beserta `-wal` dan `-shm`), dan gambar ada di `data/media/`. Cadangkan **keduanya** bersama-sama (gambar di database menunjuk ke berkas di folder itu); jangan pernah di-commit.
- **Batas unggahan di reverse proxy:** unggah gambar memakai rute biasa, bukan Server Action, dan berkas bisa sampai 10 MB. Nginx menolak badan permintaan di atas 1 MB secara bawaan, jadi setel `client_max_body_size 12m;` (atau setara di proxy lain), bila tidak unggahan gambar akan gagal.
- Simpan `.env.local` hanya di server. Kata sandi dan token tidak boleh ada di kode atau di git.
