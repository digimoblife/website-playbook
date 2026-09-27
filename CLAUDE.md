# Lapaq Playbook

## Tujuan dan audiens

Lapaq Playbook adalah website panduan produk yang membuat tim marketing internal dan partner JV memahami Lapaq serta mengikuti fitur barunya tanpa pengetahuan teknis. Lapaq adalah platform yang memungkinkan toko membuat website toko mereka sendiri. Video tutorial dinilai terlalu banyak dan panjang, jadi yang dibutuhkan adalah dokumen yang bisa dibaca dan selalu mutakhir.

- **Admin**: Product Manager, pemilik proyek dan satu-satunya pengurasi.
- **Pembaca**: tim marketing internal dan partner JV (partner masuk dengan akun).
- **Ukuran keberhasilan**: waktu yang dibutuhkan marketing untuk memahami Lapaq dan fitur barunya.

Sumber acuan: `docs/blueprint.md`. Jika berbeda dengan dokumen Blueprint asli di Claude Docs, dokumen asli yang berlaku.

Fase 1 sedang berjalan: Langkah 5 selesai (panduan skenario, gambar promosi, jadwal publish, Baru minggu ini, tampilan ponsel). Sisa Fase 1: deployment ke VPS (Langkah 4, diatur manual oleh Product Manager) dan uji penutupan. Fase 2 dimulai: Langkah 6a (Pengaturan) dan 6c (webhook GitHub) selesai; 6b menunggu akses baca ke repo Lapaq di sesi Claude. Daftar lengkap: `docs/daftar-tugas.md`.

## Keputusan kunci (dari blueprint)

- **Bentuk**: dokumen yang bisa dibaca, bukan video. Bahasa konten: Indonesia saja.
- **Arsitektur**: satu aplikasi Next.js terpisah dari Lapaq (gaya visual sama), terdiri dari dashboard admin (area login) dan website frontend. Perubahan ditarik dari GitHub, dikurasi di dashboard, lalu disajikan di frontend.
- **Hosting**: VPS sebagai pusat. Database di VPS (bukan Cloudflare D1). Cloudflare R2 opsional untuk gambar dan GIF.
- **GitHub**: webhook pada merge PR dan push ke main (bukan polling; repositori tidak punya rilis atau tag), dengan token hanya-baca.
- **AI**: Gemini 3.5 Flash Lite sebagai pilihan awal, belum final. AI hanya menerima judul dan deskripsi PR, pesan commit, dan ringkasan perubahan (bukan seluruh kode).
- **Screenshot**: Playwright pada toko demo, dijalankan di VPS. Unggah manual sebagai cadangan. Jika gagal, tandai "screenshot gagal diperbarui" dan jangan tampilkan gambar lama diam-diam.
- **Status konten**: Internal (default semua draf baru), Beta, Siap diumumkan.
- **Audiens konten**: Internal saja, Marketing, Marketing dan Partner.
- **Peran**: hanya Admin. Peran Editor tidak dibuat. Hanya Admin yang mengubah status, audiens, dan publish. Tidak ada publikasi otomatis.
- **"Jangan dijanjikan"**: hanya tampil ke marketing internal, tidak ke partner.
- **Ditunda ke fase 3**: chatbot Tanya Lapaq.
- **Fase**: (1) kurasi manual, (2) otomasi, (3) kenyamanan. Otomasi baru ditambahkan setelah kurasi manual terbukti nyaman. Mockup beranda dan halaman fitur sudah dibuat sebagai prototipe klik dan disetujui Product Manager pada 21 September 2026.
- **Sumber perubahan**: PR; commit langsung ke main masuk daftar "perlu ditinjau" di inbox. Tim Lapaq setuju memakai format commit dan mewajibkan PR untuk fitur.
- **Tambah entri manual** ("Buat entri" di dashboard) wajib dipertahankan; otomasi GitHub tidak boleh menggantikan atau menghapusnya.
- **Akses pembaca**: marketing internal dan partner sama-sama masuk dengan akun.
- **Target**: marketing memahami satu fitur baru dalam 10 menit. Anggaran sekitar $20 per bulan (VPS dan Gemini).
- **Penanda entri**: Jenis (Fitur inti atau Add-on) dan Sifat (Baru atau Pembaruan).
- **Pengelompokan**: kunci "Fitur:" pada commit dan pencocokan ke peta fitur; Admin yang memutuskan.
- **Changelog dan roadmap Lapaq**: Playbook berdiri sendiri dan tidak menautkan atau mengimpornya.
- **Di luar cakupan**: platform mirip GitBook, bahasa selain Indonesia, publikasi tanpa persetujuan admin, dan perubahan apa pun pada kode atau infrastruktur Lapaq.

### Pertanyaan yang masih terbuka
Validasi tebakan Jenis dari jalur file sebelum fase 2. Pertanyaan lain sudah dijawab Product Manager pada 26 September 2026 (lihat blueprint).

## Aturan kerja

1. **Jangan mengubah repositori Lapaq.** Tidak ada commit, branch, PR, issue, atau komentar di sana.
2. **Akses GitHub hanya baca.** Hanya perintah baca (mis. `gh pr list`, `gh api` dengan GET). Tidak ada operasi tulis. `gh` diautentikasi dengan fine-grained token read-only untuk repo ini saja.
3. **Jangan mengirim file `.env`, kunci API, atau data pelanggan ke AI.** Jangan membaca atau menyalinnya ke percakapan, prompt, atau log.
4. **Semua draf AI berstatus Internal** dan beraudiens Internal saja sampai Admin mengubahnya.
5. **Berkomunikasi dalam bahasa Indonesia**, termasuk dokumen, komentar, dan pesan commit, kecuali nama kode.
6. Kode aplikasi hanya boleh ditulis di `app/` dan hanya untuk langkah yang diminta Product Manager.
7. **Jangan membuka atau mengubah berkas di `app/data/`** (database dev dan media) secara langsung. Pemeriksaan pakai aplikasi atau salinan; bila harus membaca, gunakan salinan atau mode baca-saja.

## Struktur folder

```
lapaq-playbook/
├── CLAUDE.md
├── docs/     # blueprint dan dokumen perencanaan
│             # docs/pedoman-commit-lapaq.md: pedoman commit yang diusulkan untuk tim Lapaq
│             # docs/daftar-tugas.md: daftar tugas per fase
├── audit/    # hasil audit (mis. github-pr-audit.md)
└── app/      # aplikasi Next.js (Fase 1 sedang dibangun)
```

## Tugas pertama: audit repositori GitHub Lapaq (selesai)

Selesai; hasilnya di `audit/github-pr-audit.md`. Kode aplikasi Fase 1 sedang dibangun di `app/` sesuai langkah yang diminta Product Manager (lihat aturan kerja nomor 6).

Repositori: `bajaklautmalaka/lapaq` (GitHub)
Path lokal: `~/projects/lapaq` (hasil `gh repo clone`, di luar folder ini). Hanya baca dari clone itu; jangan commit atau push.

Audit (hanya baca) tiga hal:
1. **Label PR**: label apa yang dipakai, seberapa konsisten, dan apakah bisa dipakai untuk triase (fitur vs bug kecil vs refactor).
2. **Feature flag**: apakah ada, di mana didefinisikan, dan apakah bisa memetakan status Internal/Beta/Siap diumumkan.
3. **Kerapian penamaan PR**: konsistensi judul, kualitas deskripsi, dan kelayakannya sebagai bahan draf AI.

Jika ada rahasia atau data pelanggan di deskripsi PR atau commit, jangan disalin ke file audit; cukup catat nomor PR atau commit-nya.

Tulis hasilnya ke `audit/github-pr-audit.md` dalam bahasa Indonesia: temuan, contoh PR (nomor dan judul saja), dan rekomendasi. Ini menjawab pertanyaan terbuka pertama di blueprint.
