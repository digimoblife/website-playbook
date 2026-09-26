# Daftar Tugas Lapaq Playbook

Per 26 September 2026, diperbarui setelah Langkah 5. Disusun dari `docs/blueprint.md` (bagian Tahapan pembangunan, Spesifikasi, dan Risiko) dan dicocokkan dengan kode di `app/`. Tanda [x] berarti sudah ada di aplikasi dan teruji; [~] berarti ada sebagian atau masih percobaan; [ ] berarti belum ada.

## Fase 1 — Kurasi manual (sedang berjalan)

**Selesai jika:** PM dapat membuat dan mempublikasikan satu fitur dari nol, dan seorang anggota marketing memahaminya dari halaman itu tanpa bertanya ke developer (target 10 menit).

### Fondasi dan akun
- [x] Database SQLite, migrasi, dan seed Admin (Langkah 1)
- [x] Login, sesi, pembatas percobaan login, ganti dan reset kata sandi
- [x] Peran Admin, Marketing, dan Partner, dengan aturan akses satu pintu (`lib/access.ts`)
- [x] Akun Marketing dan Partner dibuat Admin; bisa dinonaktifkan

### Dashboard admin
- [x] Inbox berisi entri yang belum terlihat pembaca, dengan Publish cepat untuk entri yang lengkap
- [x] Tambah entri manual ("Buat entri"), yang wajib dipertahankan di semua fase
- [x] Editor entri: penjelasan, langkah pakai, materi marketing, dan FAQ
- [x] Pengaturan status, audiens, Boleh dijanjikan, dan Jangan dijanjikan
- [x] Aturan publish: entri Internal tidak bisa dipublish, dan entri harus lengkap
- [x] Unggah screenshot manual (PNG, JPEG, WebP, GIF)
- [x] Pratinjau "Lihat sebagai" Marketing atau Partner
- [x] Arsip dan pemulihan entri
- [x] Riwayat perubahan (siapa, apa, kapan)
- [x] Halaman Pengguna
- [x] Peta fitur awal (52 entri Internal dari audit)
- [x] Jadwal publish, dengan pemeriksaan ulang aturan publish saat waktunya tiba (Langkah 5c)
- [x] Jenis media "gambar promosi" di editor, terpisah dari screenshot

### Website pembaca
- [x] Beranda dengan tiga tombol tujuan
- [x] Kartu "Baru minggu ini" berisi entri yang terbit dalam 7 hari terakhir (Langkah 5d)
- [x] Apa yang baru
- [x] Katalog fitur dengan filter tag kebutuhan
- [x] Halaman fitur sesuai template: ringkasan, untuk siapa, masalah, langkah, janji, teks promosi, FAQ, dan tanggal diperbarui
- [x] Bagian "Jangan dijanjikan" tidak pernah sampai ke Partner
- [x] Tombol "Coba di toko demo"
- [x] Umpan balik "Apakah halaman ini membantu?"
- [x] Gambar promosi yang bisa diunduh di halaman fitur (Langkah 5b)
- [x] **Panduan skenario**: tabel, editor admin, dan halaman pembaca (Langkah 5a)
- [x] Cek tampilan di ponsel (375 px) untuk semua halaman pembaca dan dashboard; navbar kini terlipat di ponsel (Langkah 5e)

### Deployment ke VPS (Langkah 4)
- [ ] Siapkan VPS, reverse proxy (Nginx atau Caddy), dan HTTPS
- [ ] Setel `client_max_body_size 12m` agar unggah gambar tidak gagal
- [ ] Uji cookie `Secure` dan `X-Forwarded-For` dari alamat HTTPS sungguhan
- [ ] Jalankan aplikasi sebagai layanan (mis. systemd atau pm2) dengan `db:migrate` sebelum `start`
- [ ] Pasang cron `npm run jadwal:jalankan` setiap 5 menit (opsional, agar jadwal publish tepat menit)
- [ ] Cadangan rutin `data/playbook.db` dan `data/media/` bersama-sama
- [ ] Pastikan biaya bulanan tetap sekitar $20 (VPS dan Gemini)

### Penutupan Fase 1
- [ ] PM membuat dan menerbitkan satu fitur dari nol di server produksi
- [ ] Ukur angka dasar: berapa lama marketing memahami satu fitur tanpa Playbook
- [ ] Uji dengan satu anggota marketing: memahami fitur dari halamannya dalam 10 menit tanpa bertanya ke developer
- [x] Perbarui `CLAUDE.md` dan `app/README.md` yang masih menulis Langkah 3d dan "belum ada AI"
- [x] Perbaiki salah ketik "GitH-nya" di `README.md`

## Fase 2 — Otomasi

**Selesai jika:** sebuah merge di repositori Lapaq muncul sebagai draf di inbox lengkap dengan screenshot, dan PM dapat menerbitkannya dalam satu sesi review.

Otomasi baru dimulai setelah kurasi manual Fase 1 terbukti nyaman. Tambah entri manual tetap ada.

### Persiapan
- [ ] Validasi tebakan Jenis (fitur inti atau add-on) dari jalur file di repositori Lapaq (pertanyaan terbuka terakhir)
- [x] Pedoman commit untuk tim Lapaq (`docs/pedoman-commit-lapaq.md`); tim sudah setuju
- [ ] Pastikan tim Lapaq sudah memakai format commit dan PR untuk fitur

### Halaman Pengaturan (keputusan 26 September 2026)
- [ ] Menu Pengaturan di dashboard (hanya Admin), setiap perubahan tercatat di riwayat tanpa nilai rahasia
- [ ] URL repo GitHub (`https://github.com/pemilik/repo` atau `pemilik/repo`), divalidasi formatnya
- [ ] Token GitHub diisi dari Pengaturan: disimpan terenkripsi dengan kunci `SETTINGS_ENCRYPTION_KEY` di `.env.local`, hanya bisa diganti atau dihapus, tidak pernah ditampilkan kembali (cukup empat karakter terakhir)
- [ ] Tombol "Uji koneksi" untuk memastikan token bisa membaca repo (hanya baca)
- [ ] Nama produk yang bisa diedit, menggantikan tulisan "Lapaq" di navbar, sidebar, login, dan judul halaman
- [ ] URL toko demo dipindah dari `.env.local` ke Pengaturan
- [ ] Catat repo asal di setiap data tarikan GitHub, supaya entri lama tidak tercampur bila repo diganti
- [ ] Nama cookie sesi tidak lagi memakai "lapaq_", dan panduan memasang lebih dari satu instalasi di satu VPS

### Penarikan dari GitHub
- [~] Tarik PR dari GitHub secara manual (percobaan Langkah 4-experimental, halaman "Tarik dari GitHub")
- [ ] Penerima webhook untuk merge PR dan push ke main, dengan verifikasi tanda tangan
- [ ] Daftar commit langsung ke main yang "perlu ditinjau" di inbox

### Triase dan draf AI
- [~] Draf AI dari judul, deskripsi, dan nama file PR (percobaan, Gemini)
- [ ] Saring otomatis: copy, docs, test, chore, dan style langsung ke Arsip
- [ ] Daftar perbaikan (fix) terpisah yang jarang ditinjau
- [ ] Pencocokan ke peta fitur lewat trailer "Fitur:"; hasilnya Pembaruan atau Kandidat fitur baru
- [ ] AI memecah satu PR berisi banyak fitur menjadi beberapa usulan entri
- [ ] Inbox dikelompokkan per fitur dan berlabel hasil triase
- [ ] Pengingat untuk draf yang menunggu lebih dari seminggu

### Screenshot otomatis
- [ ] Tabel dan editor skenario screenshot per fitur
- [ ] Playwright di VPS yang menjalankan skenario pada toko demo
- [ ] Penanda "screenshot gagal diperbarui", tanpa menampilkan gambar lama diam-diam
- [ ] Jaga isi toko demo tetap stabil

### Penutupan Fase 2
- [ ] Uji ujung ke ujung: merge PR, lalu draf dengan screenshot muncul di inbox, lalu terbit dalam satu sesi review

## Fase 3 — Kenyamanan

**Selesai jika:** marketing mengetahui perubahan baru tanpa harus membuka hub, dan chatbot hanya menjawab dari isi hub dengan menautkan halaman sumbernya.

- [ ] Ringkasan mingguan ke marketing
- [ ] Penanda "baru sejak kunjunganmu"
- [ ] Ekspor PDF halaman fitur
- [ ] Chatbot Tanya Lapaq yang hanya menjawab dari isi hub dan menautkan sumbernya
