// Impor relatif (bukan "@/") karena berkas ini juga dibaca oleh drizzle-kit.
import { sql, type SQL } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  AUDIENCES,
  GITHUB_CHANGE_KINDS,
  GITHUB_CHANGE_STATES,
  KINDS,
  TRIAGE_BUCKETS,
  MEDIA_KINDS,
  MEDIA_SOURCES,
  NATURES,
  ROLES,
  STATUSES,
} from "../lib/domain";

// Waktu disimpan sebagai milidetik sejak epoch (UTC).
const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

// Daftar nilai untuk CHECK. Nilainya konstanta dari kode, bukan input pengguna.
const oneOf = (column: unknown, values: readonly string[]): SQL =>
  sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // Selalu disimpan huruf kecil oleh aplikasi.
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    partnerName: text("partner_name"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  },
  (t) => [check("users_role_check", oneOf(t.role, ROLES))],
);

// Sesi login. Kolom id berisi hash SHA-256 dari token di cookie, bukan tokennya.
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

// Pembatas percobaan login yang gagal (lihat lib/auth.ts).
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
});

export const entries = sqliteTable(
  "entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    explanation: text("explanation").notNull().default(""),
    problem: text("problem").notNull().default(""),
    forWhom: text("for_whom").notNull().default(""),
    kind: text("kind", { enum: KINDS }).notNull().default("core"),
    nature: text("nature", { enum: NATURES }).notNull().default("new"),
    // Default aman: entri baru selalu Internal, beraudiens Internal, belum terbit.
    status: text("status", { enum: STATUSES }).notNull().default("internal"),
    audience: text("audience", { enum: AUDIENCES })
      .notNull()
      .default("internal"),
    canPromise: text("can_promise").notNull().default(""),
    // Tidak boleh sampai ke Partner. Lihat lib/access.ts dan lib/entries.ts.
    cannotPromise: text("cannot_promise").notNull().default(""),
    promoText: text("promo_text").notNull().default(""),
    // Larik JSON berisi tag kebutuhan pelanggan, mis. '["stok","ongkir"]'.
    needsTags: text("needs_tags").notNull().default("[]"),
    // Nomor PR asal bila entri ini dibuat lewat "Tarik dari GitHub" (Langkah 4-experimental).
    // Hanya jejak, bukan kunci; satu PR bisa punya beberapa entri (lihat github_imports).
    sourcePrNumber: integer("source_pr_number"),
    isPublished: integer("is_published", { mode: "boolean" })
      .notNull()
      .default(false),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    // Jadwal publish yang dipasang Admin (Langkah 5). Kosong berarti tidak terjadwal. Saat waktunya
    // tiba, lib/schedule.ts memeriksa ulang aturan publish lalu menerbitkannya atas nama
    // scheduled_by; bila aturan tidak lagi terpenuhi, jadwal dibatalkan dan dicatat di riwayat.
    scheduledPublishAt: integer("scheduled_publish_at", { mode: "timestamp_ms" }),
    scheduledBy: integer("scheduled_by").references(() => users.id),
    // Entri tidak pernah dihapus, hanya diarsipkan. Entri terarsip selalu is_published = false
    // (dijaga oleh pemicu database di migrasi 0002 dan oleh lib/admin-entries.ts).
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
  },
  (t) => [
    check("entries_kind_check", oneOf(t.kind, KINDS)),
    check("entries_nature_check", oneOf(t.nature, NATURES)),
    check("entries_status_check", oneOf(t.status, STATUSES)),
    check("entries_audience_check", oneOf(t.audience, AUDIENCES)),
    index("entries_visibility_idx").on(t.isPublished, t.status, t.audience),
  ],
);

export const media = sqliteTable(
  "media",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    source: text("source", { enum: MEDIA_SOURCES }).notNull(),
    filePath: text("file_path").notNull(),
    failed: integer("failed", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
  },
  (t) => [
    check("media_kind_check", oneOf(t.kind, MEDIA_KINDS)),
    check("media_source_check", oneOf(t.source, MEDIA_SOURCES)),
    index("media_entry_id_idx").on(t.entryId),
  ],
);

export const entrySteps = sqliteTable(
  "entry_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    // Satu gambar opsional per langkah. Bila gambarnya dihapus, tautan ini menjadi kosong.
    mediaId: integer("media_id").references(() => media.id, { onDelete: "set null" }),
  },
  (t) => [unique("entry_steps_entry_position_unq").on(t.entryId, t.position)],
);

export const entryFaqs = sqliteTable(
  "entry_faqs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
  },
  (t) => [unique("entry_faqs_entry_position_unq").on(t.entryId, t.position)],
);

export const entryHistory = sqliteTable(
  "entry_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    summary: text("summary").notNull(),
  },
  (t) => [index("entry_history_entry_id_idx").on(t.entryId)],
);

export const pageFeedback = sqliteTable(
  "page_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    helpful: integer("helpful", { mode: "boolean" }).notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  },
  (t) => [
    index("page_feedback_entry_id_idx").on(t.entryId),
    // Satu pengguna hanya punya satu suara per entri; menjawab lagi meng-upsert baris ini.
    uniqueIndex("page_feedback_entry_user_unq").on(t.entryId, t.userId),
  ],
);

// Riwayat penarikan PR dari GitHub (Langkah 4-experimental). SATU BARIS PER PENARIKAN, bukan
// per PR: pr_number sengaja TIDAK unik, karena PR yang sama boleh ditarik berkali-kali dan
// setiap penarikan membuat entri baru (suntingan manual Admin pada entri lama tidak pernah
// tertimpa). entry_id menautkan baris ini ke entri yang dihasilkan penarikan itu, dipakai UI
// untuk menandai status "sudah/belum ditarik" dan menautkan ke entri-entri hasilnya.
export const githubImports = sqliteTable(
  "github_imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    prNumber: integer("pr_number").notNull(),
    prTitle: text("pr_title").notNull(),
    prUrl: text("pr_url").notNull(),
    // Repo asal ("pemilik/repo", Langkah 6a). Status "sudah ditarik" dicocokkan per repo, jadi
    // mengganti repo di Pengaturan tidak mencampur PR bernomor sama dari repo lain.
    repo: text("repo"),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    importedAt: integer("imported_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [index("github_imports_pr_number_idx").on(t.prNumber)],
);

// Panduan skenario (Langkah 5), mis. "Menunjukkan Lapaq ke calon pelanggan dalam 10 menit".
// Aturan terlihatnya SAMA dengan entri (status, audiens, terbit, arsip) dan diputuskan oleh
// lib/access.ts; panduan tidak punya "Jangan dijanjikan", jadi tidak ada kolom yang disembunyikan.
export const guides = sqliteTable(
  "guides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    // Kapan panduan ini dipakai dan apa yang perlu disiapkan.
    intro: text("intro").notNull().default(""),
    // Default aman: panduan baru selalu Internal, beraudiens Internal, belum terbit.
    status: text("status", { enum: STATUSES }).notNull().default("internal"),
    audience: text("audience", { enum: AUDIENCES })
      .notNull()
      .default("internal"),
    isPublished: integer("is_published", { mode: "boolean" })
      .notNull()
      .default(false),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    // Panduan terarsip selalu is_published = false (dijaga pemicu database di migrasi 0006).
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
  },
  (t) => [
    check("guides_status_check", oneOf(t.status, STATUSES)),
    check("guides_audience_check", oneOf(t.audience, AUDIENCES)),
    index("guides_visibility_idx").on(t.isPublished, t.status, t.audience),
  ],
);

export const guideSteps = sqliteTable(
  "guide_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guideId: integer("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    // Halaman fitur yang dirujuk langkah ini (opsional). Tautan hanya ditampilkan ke pembaca
    // yang boleh melihat entri itu (lib/guides.ts); bila entrinya dihapus, tautan menjadi kosong.
    entryId: integer("entry_id").references(() => entries.id, { onDelete: "set null" }),
  },
  (t) => [unique("guide_steps_guide_position_unq").on(t.guideId, t.position)],
);

export const guideHistory = sqliteTable(
  "guide_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guideId: integer("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(nowMs),
    summary: text("summary").notNull(),
  },
  (t) => [index("guide_history_guide_id_idx").on(t.guideId)],
);

// Pengaturan instalasi (Langkah 6a). Selalu tepat SATU baris (id = 1). Kolom yang kosong berarti
// "pakai nilai dari variabel lingkungan" supaya instalasi lama tetap berjalan (lib/settings.ts).
export const appSettings = sqliteTable(
  "app_settings",
  {
    id: integer("id").primaryKey(),
    productName: text("product_name").notNull().default("Lapaq"),
    githubRepo: text("github_repo"),
    // Token GitHub TERENKRIPSI (AES-256-GCM, kunci SETTINGS_ENCRYPTION_KEY di lingkungan server).
    // Nilai aslinya tidak pernah disimpan, dicatat, atau dikirim kembali ke browser.
    githubTokenEncrypted: text("github_token_encrypted"),
    githubTokenLast4: text("github_token_last4"),
    demoStoreUrl: text("demo_store_url"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
  },
  (t) => [check("app_settings_single_row", sql`${t.id} = 1`)],
);

export const settingsHistory = sqliteTable("settings_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  at: integer("at", { mode: "timestamp_ms" }).notNull().default(nowMs),
  // Tidak pernah berisi nilai rahasia; untuk token hanya "diganti (akhiran abcd)" atau "dihapus".
  summary: text("summary").notNull(),
});

// Perubahan yang masuk lewat webhook GitHub (Langkah 6c): PR yang di-merge ke branch utama dan
// commit langsung ke branch utama ("perlu ditinjau"). Hanya dilihat Admin. Tidak ada yang terbit
// otomatis: Admin yang memutuskan membuat draf, membuat entri, atau menandainya sudah ditinjau.
export const githubChanges = sqliteTable(
  "github_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    repo: text("repo").notNull(),
    kind: text("kind", { enum: GITHUB_CHANGE_KINDS }).notNull(),
    prNumber: integer("pr_number"),
    commitSha: text("commit_sha"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url").notNull(),
    // Larik JSON nama file yang berubah (bukan isi). Untuk PR diisi saat draf dibuat (6d).
    files: text("files").notNull().default("[]"),
    happenedAt: integer("happened_at", { mode: "timestamp_ms" }),
    receivedAt: integer("received_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowMs),
    state: text("state", { enum: GITHUB_CHANGE_STATES }).notNull().default("baru"),
    // Hasil triase otomatis saat diterima (Langkah 6d, lib/triage.ts). Admin bisa mengubahnya.
    bucket: text("bucket", { enum: TRIAGE_BUCKETS }).notNull().default("kandidat"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    entryId: integer("entry_id").references(() => entries.id, { onDelete: "set null" }),
  },
  (t) => [
    check("github_changes_kind_check", oneOf(t.kind, GITHUB_CHANGE_KINDS)),
    check("github_changes_state_check", oneOf(t.state, GITHUB_CHANGE_STATES)),
    check("github_changes_bucket_check", oneOf(t.bucket, TRIAGE_BUCKETS)),
    // Satu baris per PR dan per commit, walau webhook yang sama dikirim ulang.
    uniqueIndex("github_changes_repo_pr_unq").on(t.repo, t.prNumber),
    uniqueIndex("github_changes_repo_sha_unq").on(t.repo, t.commitSha),
    index("github_changes_state_idx").on(t.state),
  ],
);

// ID pengiriman webhook (header X-GitHub-Delivery) yang sudah diproses, supaya kiriman ulang
// dari GitHub tidak diproses dua kali.
export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" })
    .notNull()
    .default(nowMs),
});
