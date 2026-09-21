# Lapaq Playbook (aplikasi)

Website panduan produk Lapaq untuk tim marketing internal dan partner JV, dengan dashboard admin untuk Product Manager. Rancangan lengkap ada di `../docs/blueprint.md`.

**Status: Fase 1, Langkah 1 (fondasi).** Sudah ada: database, login dan peran, aturan akses konten, dan kerangka tampilan. Belum ada: editor entri, halaman fitur dan katalog, unggah media, screenshot otomatis, webhook GitHub, AI, dan deployment.

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

Setelah seed berhasil, **hapus `ADMIN_PASSWORD` dari `.env.local`**. Seed aman dijalankan ulang: akun yang sudah ada tidak diubah, dan kata sandi tidak pernah dicetak.

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

Tes yang terpenting ada di `tests/access.test.ts` dan `tests/entries-access.test.ts`: matriks 3 peran × 3 status × 3 audiens × terbit/draf, dan bukti bahwa Partner tidak pernah menerima kolom `cannot_promise`.

## Aturan akses konten

Semua diatur di satu modul, `src/lib/access.ts`.

| Peran | Yang terlihat |
| --- | --- |
| Admin | Semua entri, termasuk draf |
| Marketing | Entri yang terbit, berstatus Beta atau Siap diumumkan, beraudiens Marketing atau Marketing dan Partner, lengkap dengan "Jangan dijanjikan" |
| Partner | Entri yang terbit, berstatus Beta atau Siap diumumkan, beraudiens Marketing dan Partner, **tanpa** "Jangan dijanjikan" |

Untuk Partner, kolom `cannot_promise` tidak pernah dibaca dari database (`src/lib/entries.ts`), jadi tidak pernah sampai ke browser. Semua rute `/admin/*` hanya untuk Admin; pengguna lain dialihkan ke beranda. Setiap halaman dan server action memeriksa peran sendiri lewat `src/lib/dal.ts`, tidak hanya mengandalkan `src/proxy.ts`.

## Struktur

```
app/
├── src/
│   ├── app/            halaman dan server action (masuk, ganti-kata-sandi, admin/*)
│   ├── components/     navbar, sidebar admin, badge status
│   ├── db/             skema Drizzle dan koneksi SQLite
│   ├── lib/            access, entries, auth, users, password, session, dal
│   └── proxy.ts        pengalihan awal ke /masuk bila tanpa cookie sesi
├── drizzle/            berkas migrasi (ikut git)
├── scripts/            migrate.ts dan seed-admin.ts
├── tests/              tes Vitest
└── data/               database SQLite (tidak ikut git)
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
- Database adalah berkas `data/playbook.db` (beserta `-wal` dan `-shm`). Cadangkan berkas itu; jangan pernah di-commit.
- Simpan `.env.local` hanya di server. Kata sandi dan token tidak boleh ada di kode atau di git.
