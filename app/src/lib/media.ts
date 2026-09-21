// Penyimpanan gambar unggahan manual (source = "manual"), di disk server di luar git.
//
// Keamanan:
//  - Jenis berkas ditentukan dari ISI berkas (magic bytes), bukan dari nama, ekstensi,
//    atau Content-Type kiriman klien. SVG (dan apa pun selain PNG/JPEG/WebP/GIF) ditolak.
//  - Nama berkas di disk acak (32 heksadesimal + ekstensi dari jenis yang tervalidasi).
//    Nama asli dari klien tidak pernah dipakai di jalur berkas, jadi path traversal tidak mungkin.
//  - Saat dibaca kembali, nama di database diperiksa lagi terhadap pola yang sama.
//  - Siapa yang boleh mengambil gambar ditentukan oleh canView() di lib/access.ts,
//    berdasarkan entri pemilik gambar. Tidak ada aturan akses baru di sini.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { count, eq } from "drizzle-orm";
import { getDb, type AppDb } from "@/db/client";
import { entries, media } from "@/db/schema";
import { canView, type Viewer } from "@/lib/access";
import { logHistory, type Result } from "@/lib/admin-entries";
import { LIMITS, MEDIA_KINDS, type MediaKind } from "@/lib/domain";

const MB = 1024 * 1024;

export const IMAGE_TYPES = {
  png: { mime: "image/png", ext: "png", maxBytes: 5 * MB, label: "PNG" },
  jpeg: { mime: "image/jpeg", ext: "jpg", maxBytes: 5 * MB, label: "JPEG" },
  webp: { mime: "image/webp", ext: "webp", maxBytes: 5 * MB, label: "WebP" },
  gif: { mime: "image/gif", ext: "gif", maxBytes: 10 * MB, label: "GIF" },
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

/** Batas ukuran terbesar (GIF). Dipakai untuk menolak unggahan yang jelas kelewat besar lebih awal. */
export const MAX_UPLOAD_BYTES = IMAGE_TYPES.gif.maxBytes;

export function mediaDir(): string {
  // turbopackIgnore: lokasi ditentukan saat runtime, bukan berkas yang harus ikut dibundel.
  return resolve(/* turbopackIgnore: true */ process.cwd(), process.env.MEDIA_DIR || "data/media");
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Jenis gambar dari isi berkas, atau null bila bukan PNG, JPEG, WebP, atau GIF. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || // GIF87a
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // GIF89a
  ) {
    return "gif";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
  ) {
    return "webp";
  }
  return null;
}

const STORED_NAME = /^[0-9a-f]{32}\.(png|jpg|webp|gif)$/;

export function isStoredName(name: string): boolean {
  return STORED_NAME.test(name);
}

export function mimeForStoredName(name: string): string | null {
  const ext = name.split(".").pop();
  const type = Object.values(IMAGE_TYPES).find((t) => t.ext === ext);
  return type ? type.mime : null;
}

function safePath(dir: string, name: string): string | null {
  if (!isStoredName(name)) return null;
  const base = resolve(dir);
  const full = resolve(base, name);
  return full.startsWith(base + sep) ? full : null;
}

export async function saveImage(
  input: { entryId: number; bytes: Uint8Array; kind?: string; actorId: number },
  options: { dir?: string; db?: AppDb } = {},
): Promise<Result<{ image: { id: number; kind: MediaKind } }>> {
  const dir = options.dir ?? mediaDir();
  const db = options.db ?? getDb();

  const entry = db
    .select({ id: entries.id, archivedAt: entries.archivedAt })
    .from(entries)
    .where(eq(entries.id, input.entryId))
    .get();
  if (!entry) return { ok: false, error: "Entri tidak ditemukan." };
  if (entry.archivedAt) {
    return { ok: false, error: "Entri ini diarsipkan. Pulihkan dulu sebelum menambah gambar." };
  }

  if (input.bytes.length === 0) return { ok: false, error: "Berkas kosong." };
  const type = detectImageType(input.bytes);
  if (!type) {
    return { ok: false, error: "Jenis berkas tidak didukung. Gunakan PNG, JPEG, WebP, atau GIF." };
  }
  const spec = IMAGE_TYPES[type];
  if (input.bytes.length > spec.maxBytes) {
    return {
      ok: false,
      error: `Berkas ${spec.label} terlalu besar. Maksimal ${spec.maxBytes / MB} MB.`,
    };
  }

  const existing =
    db.select({ n: count() }).from(media).where(eq(media.entryId, input.entryId)).get()?.n ?? 0;
  if (existing >= LIMITS.imagesPerEntry) {
    return { ok: false, error: `Maksimal ${LIMITS.imagesPerEntry} gambar per entri.` };
  }

  const kind: MediaKind =
    type === "gif"
      ? "gif"
      : MEDIA_KINDS.includes(input.kind as MediaKind) && input.kind !== "gif"
        ? (input.kind as MediaKind)
        : "screenshot";

  const name = `${randomBytes(16).toString("hex")}.${spec.ext}`;
  const path = safePath(dir, name);
  if (!path) return { ok: false, error: "Gagal menyimpan berkas." };

  await mkdir(dir, { recursive: true });
  await writeFile(path, input.bytes, { flag: "wx", mode: 0o600 });

  try {
    const image = db.transaction((tx) => {
      const row = tx
        .insert(media)
        .values({
          entryId: input.entryId,
          kind,
          source: "manual",
          filePath: name,
        })
        .returning({ id: media.id })
        .get();
      logHistory(tx, input.entryId, input.actorId, `Menambah gambar (${spec.label})`);
      return { id: row.id, kind };
    });
    return { ok: true, image };
  } catch (error) {
    await unlink(path).catch(() => {});
    throw error;
  }
}

export async function deleteImage(
  mediaId: number,
  actorId: number,
  options: { dir?: string; db?: AppDb } = {},
): Promise<Result> {
  const dir = options.dir ?? mediaDir();
  const db = options.db ?? getDb();

  const row = db
    .select({
      id: media.id,
      entryId: media.entryId,
      filePath: media.filePath,
      archivedAt: entries.archivedAt,
    })
    .from(media)
    .innerJoin(entries, eq(entries.id, media.entryId))
    .where(eq(media.id, mediaId))
    .get();
  if (!row) return { ok: false, error: "Gambar tidak ditemukan." };
  if (row.archivedAt) {
    return { ok: false, error: "Entri ini diarsipkan. Pulihkan dulu sebelum menghapus gambar." };
  }

  // Langkah yang memakai gambar ini otomatis kehilangan tautannya (FK ON DELETE SET NULL).
  db.transaction((tx) => {
    tx.delete(media).where(eq(media.id, mediaId)).run();
    logHistory(tx, row.entryId, actorId, "Menghapus gambar");
  });

  const path = safePath(dir, row.filePath);
  if (path) await unlink(path).catch(() => {});
  return { ok: true };
}

/**
 * Berkas gambar yang boleh dilihat pengguna ini, atau null. "Tidak ada" dan "tidak boleh"
 * sengaja tidak dibedakan. Keputusan akses sepenuhnya oleh canView() atas entri pemiliknya.
 */
export function getMediaForViewer(
  viewer: Viewer,
  mediaId: number,
  db: AppDb = getDb(),
): { name: string; mime: string } | null {
  const row = db
    .select({
      filePath: media.filePath,
      isPublished: entries.isPublished,
      status: entries.status,
      audience: entries.audience,
      archivedAt: entries.archivedAt,
    })
    .from(media)
    .innerJoin(entries, eq(entries.id, media.entryId))
    .where(eq(media.id, mediaId))
    .get();
  if (!row || !canView(viewer, row)) return null;
  const mime = mimeForStoredName(row.filePath);
  if (!mime || !isStoredName(row.filePath)) return null;
  return { name: row.filePath, mime };
}

export async function readStoredImage(name: string, dir: string = mediaDir()): Promise<Buffer | null> {
  const path = safePath(dir, name);
  if (!path) return null;
  try {
    // turbopackIgnore: berkas media ada di folder data yang ditentukan saat runtime, bukan bagian dari bundel.
    return await readFile(/* turbopackIgnore: true */ path);
  } catch {
    return null;
  }
}

