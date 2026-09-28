// Enkripsi nilai rahasia yang disimpan di database (Langkah 6a: token GitHub dari Pengaturan).
//
// AES-256-GCM dengan kunci dari variabel lingkungan SETTINGS_ENCRYPTION_KEY (32 byte, ditulis
// sebagai base64 atau 64 karakter heksadesimal; buat dengan `openssl rand -base64 32`). Kunci
// sengaja TIDAK disimpan di database: cadangan database yang bocor tidak cukup untuk membuka token.
// GCM juga mendeteksi isi yang diubah atau kunci yang salah (dekripsi gagal, bukan hasil sampah).
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

export type KeyResult = { ok: true; key: Buffer } | { ok: false; error: string };

export const MISSING_KEY_MESSAGE =
  "SETTINGS_ENCRYPTION_KEY belum diisi di lingkungan server. Buat dengan `openssl rand -base64 32`, simpan di .env.local, lalu mulai ulang aplikasi.";

/** Membaca kunci dari lingkungan. Nilai kunci tidak pernah ikut di pesan galat. */
export function encryptionKey(raw: string | undefined = process.env.SETTINGS_ENCRYPTION_KEY): KeyResult {
  const value = raw?.trim();
  if (!value) return { ok: false, error: MISSING_KEY_MESSAGE };
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) {
    return {
      ok: false,
      error: "SETTINGS_ENCRYPTION_KEY tidak valid: harus 32 byte (base64 dari `openssl rand -base64 32`, atau 64 karakter heksadesimal).",
    };
  }
  return { ok: true, key };
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(".");
}

/** null bila format salah, kunci berbeda, atau isi diubah. */
export function decryptSecret(sealed: string, key: Buffer): string | null {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [, iv, tag, body] = parts;
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
