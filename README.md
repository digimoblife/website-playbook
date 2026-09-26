# Lapaq Playbook

Website panduan produk yang membantu tim marketing internal dan partner JV memahami **Lapaq** (platform yang memungkinkan toko membuat website toko mereka sendiri) beserta fitur-fitur barunya, tanpa perlu pengetahuan teknis. Video tutorial dinilai terlalu banyak dan panjang — yang dibutuhkan adalah dokumen yang bisa dibaca dan selalu mutakhir.

- **Admin**: Product Manager, pemilik proyek dan satu-satunya pengurasi konten.
- **Pembaca**: tim marketing internal dan partner JV (partner masuk dengan akun).
- **Ukuran keberhasilan**: waktu yang dibutuhkan marketing untuk memahami Lapaq dan fitur barunya.

Rancangan lengkap ada di [`docs/blueprint.md`](docs/blueprint.md). Aturan kerja dan status pengerjaan saat ini ada di [`CLAUDE.md`](CLAUDE.md).

## Bentuk dan arsitektur

Satu aplikasi Next.js (di folder [`app/`](app/)), terpisah dari Lapaq tapi memakai gaya visual yang sama, terdiri dari:

- **Dashboard admin** — area login tempat Product Manager mengurasi perubahan yang ditarik dari GitHub, mengatur status dan audiens, lalu mempublikasikan.
- **Website frontend** — halaman yang dibaca tim marketing dan partner JV.

Perubahan pada produk Lapaq ditarik dari repositori GitH-nya (`bajaklautmalaka/lapaq`, hanya dibaca), dikurasi manual oleh Admin, lalu disajikan ke pembaca. Draf AI (opsional) membantu menulis penjelasan awal, tapi keputusan status, audiens, dan publish selalu di tangan Admin.

## Status

Proyek berjalan bertahap per Langkah, dicatat di [`CLAUDE.md`](CLAUDE.md#tujuan-dan-audiens) (baris "Fase 1 sedang berjalan"). Riwayat commit di repo ini mengikuti penamaan yang sama.

## Struktur folder

```
lapaq-playbook/
├── CLAUDE.md   # aturan kerja dan status Langkah saat ini
├── docs/       # blueprint dan dokumen perencanaan
├── audit/      # hasil audit repositori GitHub Lapaq
├── app/        # aplikasi Next.js (dashboard admin + website), lihat app/README.md
└── prototipe/  # mockup klik yang sudah disetujui Product Manager
```

Detail menjalankan, menguji, dan struktur kode aplikasi ada di [`app/README.md`](app/README.md).

## Aturan penting

- Kode aplikasi hanya ditulis di `app/`.
- Repositori Lapaq (`bajaklautmalaka/lapaq`) hanya pernah dibaca lewat GitHub API — tidak pernah ada commit, branch, PR, atau perubahan apa pun ke sana dari proyek ini.
- Rahasia (token, kunci API, kata sandi) tidak pernah disimpan di repo ini — lihat `app/.env.example` untuk daftar variabel lingkungan yang dibutuhkan, isi nilainya di `app/.env.local` (tidak ikut git).

Daftar lengkap aturan kerja ada di [`CLAUDE.md`](CLAUDE.md#aturan-kerja).
