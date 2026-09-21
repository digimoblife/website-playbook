# Pedoman Commit dan Pull Request Lapaq

Tujuan: supaya setiap perubahan bisa dikenali sebagai fitur, perbaikan, atau perubahan kecil, tanpa harus dibaca kodenya. Hasilnya dipakai untuk menyusun dokumentasi produk bagi tim marketing dan partner (Lapaq Playbook).

Aturan ini ringan. Yang paling penting hanya tiga: **tipe commit**, **trailer `Fitur:`** untuk fitur baru, dan **deskripsi PR yang selalu diisi**.

## 1. Format commit

```
<tipe>(<area>): <ringkasan singkat>

<satu kalimat manfaat bagi pengguna, khusus untuk feat>

Fitur: <slug-fitur>
```

Baris kedua dan ketiga hanya wajib untuk commit bertipe `feat`. Untuk tipe lain, satu baris pertama sudah cukup.

## 2. Tipe commit

| Tipe | Dipakai untuk | Contoh |
| --- | --- | --- |
| `feat` | Kemampuan baru yang terlihat oleh pengguna (pembeli, penjual, atau admin) | `feat(storefront): tambah pencarian produk` |
| `fix` | Memperbaiki sesuatu yang rusak | `fix(orders): perbaiki total pesanan dengan kupon` |
| `copy` | Hanya mengubah teks tampilan | `copy(storefront): ubah teks tombol keranjang` |
| `style` | Hanya mengubah tampilan (CSS, jarak, warna) tanpa mengubah fungsi | `style(admin): rapikan jarak kartu dashboard` |
| `refactor` | Merapikan kode tanpa mengubah perilaku | `refactor(wallet): pisahkan hitungan saldo` |
| `docs` | Dokumentasi | `docs: perbarui README` |
| `test` | Menambah atau memperbaiki tes | `test(orders): tambah tes kupon` |
| `chore` | Pekerjaan pendukung (dependensi, konfigurasi, build) | `chore: perbarui dependensi` |

Kalau ragu antara `feat` dan `style`: apakah pengguna bisa **melakukan sesuatu yang sebelumnya tidak bisa**? Kalau ya, itu `feat`. Kalau hanya tampilannya yang berubah, itu `style` atau `copy`.

## 3. Area

Kata pendek yang menunjukkan bagian produk yang berubah:

`storefront` (toko pelanggan), `admin` (dashboard penjual), `orders`, `wallet`, `payments`, `cms`, `superadmin`, `affiliate`, `notifications`.

Untuk add-on, tulis `addon/<nama>`, misalnya `addon/kunci-stok`. Ini yang membedakan add-on dari fitur inti.

## 4. Trailer `Fitur:`

Baris terakhir pada commit `feat`, berisi nama pendek fitur (slug). Aturannya:

- Huruf kecil, kata dipisah tanda hubung: `pencarian-toko`, `kunci-stok`.
- **Semua commit untuk fitur yang sama memakai slug yang sama.** Dengan begitu sistem tahu bahwa lima commit kecil adalah satu fitur, bukan lima fitur.
- Slug tidak diganti di tengah jalan. Kalau fitur sudah punya slug, pakai terus untuk pengembangan berikutnya.
- Untuk commit yang menyempurnakan fitur lama tanpa menambah kemampuan baru, tidak perlu trailer; cukup tipe `fix`, `style`, atau `copy`.

## 5. Contoh lengkap

Fitur baru:

```
feat(storefront): tambah pencarian produk di halaman toko

Pembeli bisa mencari produk dari kolom pencarian dan melihat semua produk di katalog.

Fitur: pencarian-toko
```

Lanjutan fitur yang sama (commit kedua):

```
feat(storefront): tambah halaman katalog semua produk

Pembeli bisa menelusuri semua produk toko dalam satu halaman.

Fitur: pencarian-toko
```

Add-on:

```
feat(addon/kunci-stok): tambah pengaturan durasi kunci stok

Penjual bisa mengatur berapa lama stok dikunci saat pembeli checkout.

Fitur: kunci-stok
```

Perubahan kecil:

```
copy(storefront): ubah teks tombol keranjang
```

## 6. Pull request

- **Judul** memakai format yang sama seperti baris pertama commit: `feat(storefront): tambah pencarian dan katalog`.
- **Deskripsi selalu diisi**, dengan pola yang sudah dipakai di PR #4, #5, dan #7:
  - **Ringkasan**: daftar butir perubahan dalam bahasa sederhana. Kalau satu PR berisi beberapa fitur, tulis satu butir per fitur.
  - **Verifikasi**: apa yang sudah diuji.
- **Label** dipasang di setiap PR:

| Tipe | Label |
| --- | --- |
| `feat` | `enhancement` |
| `fix` | `bug` |
| `copy`, `style`, `refactor`, `docs`, `test`, `chore` | satu label tambahan, misalnya `chore` |

- **Fitur baru sebaiknya lewat PR**, bukan langsung ke `main`, supaya satuan perubahannya jelas.
- Nama branch sebaiknya menggambarkan isi PR, dan tidak dipakai ulang untuk pekerjaan yang berbeda.

## 7. Yang tidak boleh ada di pesan commit atau PR

Kunci API, kata sandi, isi file `.env`, dan data pelanggan. Pesan commit dan deskripsi PR akan dibaca oleh sistem dokumentasi, jadi tulis hanya apa yang berubah, bukan datanya.

## 8. Tidak wajib untuk masa lalu

Aturan ini berlaku untuk perubahan baru. Riwayat commit lama tidak perlu diubah.
