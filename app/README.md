# Lapaq Playbook (aplikasi)

Website panduan produk Lapaq untuk tim marketing internal dan partner JV, dengan dashboard admin untuk Product Manager. Rancangan lengkap ada di `../docs/blueprint.md`.

**Status: Fase 1, Langkah 5 selesai; Fase 2, Langkah 6a sampai 6e selesai (Pengaturan, validasi Jenis, webhook, triase, screenshot otomatis).** Sudah ada: database, login dan peran, aturan akses konten, dashboard admin lengkap (termasuk jadwal publish), website untuk pembaca (Beranda dengan "Baru minggu ini", Apa yang baru, Katalog dengan filter tag, halaman fitur dengan FAQ, gambar promosi yang bisa diunduh, dan tombol "Coba di toko demo", Panduan skenario, umpan balik "Apakah halaman ini membantu?", pratinjau "Lihat sebagai" untuk Admin), serta percobaan "Tarik dari GitHub" dengan draf AI (Langkah 4-experimental, penarikan manual per PR). Menu **Pengaturan** mengatur nama produk, repo GitHub, token GitHub, dan toko demo. Webhook GitHub mencatat PR yang di-merge dan commit langsung ke branch utama ke bagian "Dari GitHub" di Inbox. Perubahan itu ditriase otomatis dan dikelompokkan per fitur. Draf AI untuk PR bisa dipecah menjadi beberapa usulan entri. Screenshot otomatis diambil dari toko demo lewat skenario per entri. Belum ada: deployment (Langkah 4) dan uji ujung ke ujung Fase 2 di VPS.

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

Sudah punya database dari langkah sebelumnya? Cukup jalankan `npm run db:migrate`. Setiap migrasi (Langkah 2: dua kolom dan dua pemicu; Langkah 3: indeks unik pada umpan balik halaman; Langkah 3d: tabel `entry_faqs`; Langkah 4-experimental: tabel `github_imports`; Langkah 5: tabel `guides`, `guide_steps`, `guide_history` dan kolom jadwal publish pada `entries`; Langkah 6a: tabel `app_settings`, `settings_history`, dan kolom `repo` pada `github_imports`; Langkah 6c: tabel `github_changes` dan `webhook_deliveries`; Langkah 6d: kolom `bucket` pada `github_changes`, lewat pembuatan ulang tabel yang menyalin semua baris, dan tabel `ai_proposals`; Langkah 6e: tabel `screenshot_scenarios` dan kolom `auto_key` pada `media`) bersifat aditif dan tidak menghapus atau mengubah data yang ada.

Setelah seed berhasil, **hapus `ADMIN_PASSWORD` dari `.env.local`**. Seed aman dijalankan ulang: akun yang sudah ada tidak diubah, dan kata sandi tidak pernah dicetak.

## Peta fitur awal dan gambar

Isi Inbox dengan peta fitur awal (52 entri dari audit bagian 8, area A sampai D). Semuanya berstatus Internal, beraudiens Internal, dan belum terbit, jadi tidak terlihat oleh Marketing maupun Partner. Aman dijalankan berulang kali; entri yang sudah ada tidak disentuh.

**Aturan publish dan Inbox.** Entri yang tidak akan terlihat pembaca (status Internal, atau audiens Internal) **tidak bisa dipublish**: server menolak dengan pesan "Ubah status dan audiens dari Internal dulu, baru Publish. Untuk menyimpan tanpa menampilkan, pakai Simpan.", dan tombol Publish di editor nonaktif dengan alasan yang terlihat. Entri yang akan terlihat harus lengkap (Ringkasan, minimal satu langkah, Boleh dijanjikan, Jangan dijanjikan). Inbox berisi entri yang **belum terlihat oleh pembaca** dan belum diarsipkan; tombol Publish di Inbox hanya muncul untuk entri yang akan terlihat dan lengkap, jadi seluruh 52 entri peta fitur tampil tanpa tombol Publish sampai statusnya diubah.

```bash
npm run db:seed:peta
```

Gambar yang diunggah di editor disimpan di `data/media/` (di luar git) dengan nama acak, dan hanya dilayani lewat `/media/[id]` untuk pengguna yang berhak. Lokasinya bisa diubah dengan `MEDIA_DIR`. PNG, JPEG, dan WebP maksimal 5 MB, GIF maksimal 10 MB, maksimal 20 gambar per entri; SVG ditolak, dan jenis berkas ditentukan dari isinya, bukan dari nama atau ekstensi.

## Panduan skenario

Menu **Panduan skenario** di dashboard membuat alur langkah demi langkah yang merangkai beberapa fitur, mis. "Menunjukkan Lapaq ke calon pelanggan dalam 10 menit". Pembaca membukanya di `/panduan`. Aturannya sama dengan entri: panduan baru selalu Internal, beraudiens Internal, dan belum terbit; hanya Admin yang mengubah status, audiens, dan publish; panduan Internal tidak bisa dipublish; panduan yang akan terlihat wajib punya ringkasan dan minimal satu langkah. Setiap langkah boleh menautkan satu halaman fitur. Tautan itu (termasuk judul fiturnya) **hanya** tampil ke pembaca yang boleh melihat fitur tersebut; pembaca lain tetap melihat teks langkahnya tanpa tautan, dan editor memberi peringatan bila hal ini terjadi (`src/lib/guides.ts`, `src/lib/guide-rules.ts`).

## Jadwal publish

Di kartu **Pengaturan publikasi**, entri yang lolos aturan publish bisa dijadwalkan terbit pada tanggal dan jam tertentu (mengikuti jam perangkat Admin; riwayat mencatatnya dalam WIB). Saat waktunya tiba, aturan publish **diperiksa ulang**: bila entri sudah diubah sehingga tidak lolos (mis. status kembali Internal), jadwal dibatalkan otomatis dan alasannya dicatat di riwayat. Publish manual dan Arsipkan membatalkan jadwal. Tanggal terbit memakai waktu jadwal.

Jadwal dijalankan setiap kali halaman website atau dashboard dibuka, jadi tidak perlu proses latar. Bila jadwal harus tepat menit walau tidak ada yang membuka situs, pasang cron di VPS, mis. setiap 5 menit:

```bash
*/5 * * * * cd /jalur/ke/app && npm run --silent jadwal:jalankan
```

## Pengaturan

Menu **Pengaturan** (hanya Admin) berisi:

- **Nama produk**, tampil sebagai "{nama} Playbook" di navbar, dashboard, halaman masuk, dan judul halaman. Bawaannya "Lapaq".
- **Repo GitHub**, berupa URL (`https://github.com/pemilik/repo`) atau `pemilik/repo`.
- **Token GitHub**, disimpan **terenkripsi** (AES-256-GCM) dengan kunci `SETTINGS_ENCRYPTION_KEY` dari `.env.local`. Tanpa kunci itu token tidak bisa disimpan dari Pengaturan. Setelah disimpan, token tidak pernah ditampilkan lagi (hanya empat karakter terakhir) dan hanya bisa diganti atau dihapus. Pakai fine-grained token **hanya-baca**.
- **URL toko demo** untuk tombol "Coba di toko demo".
- Tombol **Uji koneksi**: satu permintaan baca ke GitHub. Bila token ternyata punya akses tulis, halaman memberi peringatan.

Setiap perubahan tercatat di riwayat Pengaturan, tanpa nilai token. Kolom yang dikosongkan memakai `GITHUB_REPO`, `GITHUB_TOKEN`, dan `DEMO_STORE_URL` dari `.env.local`, jadi instalasi lama tetap berjalan tanpa diubah. Setiap tarikan PR mencatat repo asalnya, sehingga mengganti repo tidak mencampur PR bernomor sama dari repo lain.

**Jangan mengganti `SETTINGS_ENCRYPTION_KEY`** setelah token disimpan. Bila terpaksa, halaman Pengaturan akan menandai token tidak bisa dibuka; isi ulang tokennya.

## Webhook GitHub

`POST /api/github/webhook` menerima kabar dari GitHub. Ini satu-satunya rute yang bisa dipanggil tanpa login; sebagai gantinya setiap kiriman **wajib** bertanda tangan HMAC-SHA256 dengan `GITHUB_WEBHOOK_SECRET` (tanpa rahasia itu semua kiriman ditolak), dan hanya repo yang ada di Pengaturan yang diproses.

- **PR yang di-merge ke branch utama** dicatat di Inbox, bagian "Dari GitHub", dengan tombol **Buat draf AI** (alur yang sama dengan "Tarik dari GitHub").
- **Commit langsung ke branch utama** masuk daftar **"Perlu ditinjau"**, dengan tombol **Buat entri** (tanpa AI; judulnya dari pesan commit). Commit hasil merge PR ("Merge pull request #12" atau "Judul (#12)") dilewati karena sudah tercakup PR-nya.
- Semua bisa ditandai **Tandai ditinjau**. Tidak ada yang terbit otomatis; entri yang dibuat dari sini selalu Internal, beraudiens Internal, dan belum terbit.
- Kiriman ulang dari GitHub (ID pengiriman sama) dan PR atau commit yang sama tidak dicatat dua kali.

Memasang webhook (dilakukan pemilik repo, karena Playbook tidak pernah mengubah repo produk):

1. Isi `GITHUB_WEBHOOK_SECRET` di `.env.local` dengan `openssl rand -hex 32`, lalu mulai ulang aplikasi.
2. Di GitHub: repo produk, **Settings, Webhooks, Add webhook**.
3. **Payload URL**: `https://domain-playbook-anda/api/github/webhook`. **Content type**: `application/json`. **Secret**: nilai yang sama dengan langkah 1.
4. **Which events**: pilih "Let me select individual events", centang **Pull requests** dan **Pushes** saja.
5. Simpan. GitHub mengirim `ping`; di tab **Recent Deliveries** jawabannya harus `200 pong`.

## Triase perubahan dari GitHub

Setiap perubahan yang masuk lewat webhook ditriase dari judulnya (`src/lib/triage.ts`):

| Tipe di judul (Conventional Commits) | Masuk ke |
| --- | --- |
| `docs`, `test`, `chore`, `style`, `copy` | **Arsip GitHub** |
| `fix` | **Perbaikan** (jarang ditinjau) |
| lainnya: `feat`, `refactor`, atau tanpa tipe | **Kandidat** di Inbox |

Fitur inti dan add-on sama-sama menjadi kandidat; Jenis hanya label. Admin bisa memindahkan perubahan antar kelompok kapan saja (tombol "Jadikan kandidat", "Ke Perbaikan", "Ke Arsip"), jadi tidak ada yang hilang.

Kandidat di Inbox dikelompokkan per fitur lewat trailer `Fitur: slug` di pesan commit atau deskripsi PR:

- **Pembaruan: {entri}**: kunci cocok dengan slug entri yang ada. Jenisnya diambil dari entri itu, dan "Tandai ditinjau" menautkan perubahan ke entri tersebut.
- **Kandidat fitur baru: {slug}**: kunci belum punya entri. "Buat entri" atau "Buat draf AI" membuat entri dengan slug itu, sehingga perubahan berikutnya dengan kunci yang sama otomatis menjadi Pembaruan.
- **Belum berkunci Fitur**: tanpa trailer.

Tanpa kunci yang cocok, Jenis **ditebak** (label "Tebakan") sesuai `audit/validasi-jenis.md`: Add-on bila menyentuh file layanan add-on tertentu atau judulnya menyebut nama entri add-on; perubahan yang hanya menyentuh sistem add-on atau superadmin ditebak Fitur inti. Pencocokan nama hanya mengenali nama entri persis (mis. "Kunci stok"), bukan terjemahannya; kunci `Fitur:` tetap cara yang andal. Tebakan dicatat di riwayat entri dan dikonfirmasi Admin di editor.

**Satu PR, beberapa fitur:** tombol **Buat draf AI** meminta AI (yang hanya menerima judul, deskripsi, dan nama file PR) memecah PR menjadi 1 sampai 5 usulan, satu per fitur atau pembaruan. Bila hanya satu, entri langsung dibuat. Bila lebih, Admin dibawa ke halaman **Usulan** (`/admin/github/usulan/[id]`) untuk memilih usulan mana yang dijadikan entri, lalu **Selesai** menandai PR ditinjau. Membuat usulan ulang hanya mengganti usulan yang belum dijadikan entri. Semua entri tetap Internal dan belum terbit.

**Pengingat:** Inbox menampilkan pengingat untuk perubahan GitHub yang menunggu lebih dari 7 hari, dan untuk draf yang belum disentuh lebih dari 7 hari **bila** draf itu berasal dari GitHub atau sudah diatur tampil ke pembaca. Draf peta fitur yang masih Internal sengaja tidak diingatkan.

## Screenshot otomatis

Di editor entri ada kartu **Screenshot otomatis**. Skenarionya teks sederhana, satu perintah per baris, dan dijalankan Playwright pada toko demo dari Pengaturan:

```
ukuran 390x844
buka /produk
klik text=Tambah ke keranjang
isi #email => ${DEMO_STORE_EMAIL}
tunggu .keranjang
foto
foto .kartu-produk
```

- Perintah: `ukuran` (opsional, baris pertama), `buka` (jalur di toko demo saja), `klik`, `isi selector => nilai`, `tunggu selector` atau `tunggu 1500` (maks 5000 ms), `foto` (layar) atau `foto selector` (satu elemen). Maksimal 30 langkah dan 5 foto. Bukan kode: tidak ada JavaScript bebas.
- Browser tidak boleh meninggalkan toko demo; batas 15 detik per langkah dan 90 detik per skenario; satu skenario berjalan pada satu waktu.
- Nilai akun demo ditulis `${DEMO_STORE_EMAIL}` dan `${DEMO_STORE_PASSWORD}` (dari `.env.local`), tidak disimpan di database, dan disamarkan dari pesan galat. Editor memperingatkan bila kata sandi ditulis langsung.
- Setiap `foto` menjadi gambar "Screenshot (otomatis)". Menjalankan ulang memakai baris gambar yang sama, jadi tautan ke langkah "Cara pakai" tetap utuh.
- **Bila gagal**, semua screenshot otomatis entri itu ditandai **"screenshot gagal diperbarui"**: tidak tampil ke pembaca (galeri, gambar langkah, dan `/media`), Admin melihat tanda merah dan pesan galatnya, dan unggahan manual tetap bisa dipakai. Berhasil lagi menghapus tandanya.

Menjalankan: tombol **Simpan dan jalankan sekarang** di editor, atau semua skenario sekaligus lewat cron di VPS:

```bash
npx playwright install chromium --with-deps   # sekali, di VPS
15 2 * * * cd /jalur/ke/app && npm run --silent screenshot:jalankan
```

## Memasang lebih dari satu produk di satu VPS

Satu instalasi untuk satu produk. Untuk produk lain, jalankan kode yang sama sekali lagi dengan berkas lingkungan, database, folder gambar, port, dan domain sendiri. Semua pengaturan dibaca saat berjalan, jadi satu kali `npm run build` cukup untuk semua instalasi.

| | Produk 1 | Produk 2 |
| --- | --- | --- |
| Domain | `playbook.lapaq.id` | `playbook.produkx.id` |
| Berkas lingkungan | `/etc/playbook/lapaq.env` | `/etc/playbook/produkx.env` |
| `DATABASE_PATH` | `/var/playbook/lapaq/playbook.db` | `/var/playbook/produkx/playbook.db` |
| `MEDIA_DIR` | `/var/playbook/lapaq/media` | `/var/playbook/produkx/media` |
| `PORT` | 3001 | 3002 |
| `SETTINGS_ENCRYPTION_KEY` | kunci sendiri | kunci sendiri |

Langkah untuk produk baru:

1. Buat berkas lingkungan baru (lihat tabel), dengan `SETTINGS_ENCRYPTION_KEY` hasil `openssl rand -base64 32`.
2. Buat database dan Admin pertama: `set -a; . /etc/playbook/produkx.env; set +a; npm run db:migrate && npm run db:seed`.
3. Tambah satu blok domain di Nginx atau Caddy yang meneruskan ke port-nya (ingat `client_max_body_size 12m`).
4. Tambah satu layanan, mis. templat systemd `playbook@.service` dengan `EnvironmentFile=/etc/playbook/%i.env` dan `ExecStart=/usr/bin/npm run start -- -p ${PORT}`, lalu `systemctl enable --now playbook@produkx`.
5. Masuk sebagai Admin, buka **Pengaturan**, isi nama produk, repo, token, dan toko demo.

Saat memperbarui kode: `git pull` dan `npm run build` sekali, lalu `npm run db:migrate` dan restart untuk setiap instalasi. Cadangkan database dan folder gambar setiap instalasi secara terpisah.

**Pakai domain atau subdomain terpisah, jangan hanya beda port di domain yang sama.** Browser tidak membedakan cookie berdasarkan port, sehingga login di satu instalasi bisa menimpa sesi instalasi lain. Setiap instalasi Next.js memakai kira-kira 150 sampai 250 MB memori (perkiraan, belum diukur).

Catatan: sejak Langkah 6a cookie sesi bernama `playbook_sesi` (sebelumnya `lapaq_sesi`), jadi semua pengguna perlu masuk ulang satu kali setelah pembaruan ini. Skrip `npm run db:seed:peta` (peta fitur awal) khusus untuk Lapaq; jangan dijalankan untuk produk lain.

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

Semua tes memakai database SQLite di memori dan folder sementara; database dan gambar Anda tidak tersentuh. Yang terpenting: `access.test.ts` dan `entries-access.test.ts` (matriks 3 peran × 3 status × 3 audiens × terbit/draf, dan Partner tidak pernah menerima `cannot_promise`), `actions.test.ts` (setiap Server Action menolak selain Admin dan database tetap utuh), `routes.test.ts` dan `media.test.ts` (akses, unggah, dan path traversal gambar), `admin-entries.test.ts` (aturan publish, arsip, pemicu database, dan validasi/penyimpanan FAQ), `entries-detail.test.ts` (langkah, galeri, dan FAQ hanya untuk yang berhak — FAQ sendiri tidak dibatasi peran), `preview.test.ts` (cookie pratinjau diabaikan untuk akun bukan Admin), `feedback.test.ts` (upsert umpan balik, Admin ditolak), `demo-store.test.ts` (validasi URL toko demo), `guides.test.ts` (aturan publish panduan, matriks akses, dan tautan fitur yang tidak boleh bocor), `schedule.test.ts` (jadwal publish, termasuk pembatalan otomatis bila aturan tidak lagi terpenuhi), `settings.test.ts` (validasi repo dan token, enkripsi, riwayat tanpa nilai rahasia, dan cadangan ke variabel lingkungan), `github-webhook.test.ts` (tanda tangan, repo lain, kiriman ulang, PR yang di-merge, dan commit langsung), `triage.test.ts` (aturan triase, pengelompokan per fitur, tebakan Jenis, pengingat, dan regresi hitungan langkah), `screenshot.test.ts` (pengurai skenario, lalu Chromium sungguhan terhadap toko demo palsu: berhasil, ulang, gagal dan disembunyikan, tidak keluar dari toko demo, rahasia disamarkan; bagian Chromium dilewati bila browser tidak terpasang), dan `website-pages.test.ts` (halaman website benar-benar dirender ke HTML dan diperiksa, bukan hanya datanya — termasuk FAQ, tombol "Coba di toko demo", gambar promosi, Panduan skenario, dan "Baru minggu ini").

## Website dan pratinjau Admin

Marketing dan Partner yang login mendapat website biasa (`/`, `/baru`, `/katalog`, `/entri/[slug]`, `/panduan`, `/panduan/[slug]`), memakai `lib/entries.ts` dan `lib/guides.ts` sebagai sumber data (lihat "Aturan akses konten"). Halaman fitur menampilkan bagian "Pertanyaan yang sering diajukan" bila entrinya punya FAQ (dilewati diam-diam bila kosong, sama seperti galeri) — FAQ **tidak** dibatasi peran seperti "Jangan dijanjikan", jadi Marketing dan Partner melihat FAQ yang sama. Tombol "Coba di toko demo" muncul di semua halaman fitur bila variabel lingkungan `DEMO_STORE_URL` diset ke URL http/https yang sah (lihat `.env.example` dan `src/lib/demo-store.ts`); tersembunyi total bila tidak diset atau tidak valid. Gambar berjenis **Gambar promosi** tidak ikut galeri "Cara kerja", melainkan tampil di "Materi siap pakai" dengan tombol Unduh (`/media/[id]?unduh=1`, aturan aksesnya sama). Kartu "Baru minggu ini" di beranda hanya berisi entri yang terbit dalam 7 hari terakhir.

**Pratinjau "Lihat sebagai".** Admin yang membuka website tidak melihat pandangan Admin (semua entri): ia otomatis dipetakan ke viewer sintetis Marketing atau Partner, dengan default "Marketing" dan bisa dipilih lewat pita di navbar. Nilainya disimpan di cookie `pratinjau_peran` (non-`httpOnly`, `SameSite=lax`, berumur 1 hari), dan **diabaikan total** untuk akun Marketing/Partner sungguhan — mereka selalu memakai peran akun mereka sendiri, apa pun isi cookie itu (lihat `src/lib/preview.ts`).

Umpan balik halaman hanya berlaku untuk akun Marketing/Partner sungguhan; Admin (termasuk saat berpratinjau) tidak melihat kontrolnya dan ditolak bila mencoba mengirimkannya langsung.

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
│   ├── app/            halaman, server action, dan rute (masuk, admin/*, (situs)/*, media/[id])
│   │                   termasuk admin/panduan dan (situs)/panduan
│   ├── components/     navbar, preview-switch, sidebar admin, badge status, tombol aksi
│   ├── db/             skema Drizzle dan koneksi SQLite
│   ├── lib/            access (aturan akses), publish (aturan publish), admin-entries,
│   │                   entries (baca untuk pembaca, termasuk detail langkah/galeri/FAQ),
│   │                   preview (pratinjau Admin), demo-store (validasi DEMO_STORE_URL),
│   │                   feedback, media, users, auth, password, dal, peta-fitur,
│   │                   guides dan guide-rules (panduan skenario), schedule (jadwal publish),
│   │                   settings dan secret-box (Pengaturan, enkripsi token),
│   │                   github-webhook, github-changes, dan triage (webhook, triase, dan Inbox),
│   │                   screenshot-scenario dan screenshot-runner (screenshot otomatis)
│   └── proxy.ts        pengalihan awal ke /masuk bila tanpa cookie sesi
├── drizzle/            berkas migrasi (ikut git)
├── scripts/            migrate, seed-admin, seed-peta, admin-reset, publish-due dan screenshot (untuk cron)
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
