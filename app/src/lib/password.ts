import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// Algorithm.Argon2id. Enum-nya `const enum`, tidak bisa diimpor dengan isolatedModules.
const ARGON2ID = 2;

// Parameter minimum yang disarankan OWASP untuk argon2id (19 MiB, 2 iterasi, 1 lajur).
const HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, HASH_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false; // hash rusak atau format tak dikenal
  }
}

// Hash tiruan untuk pengguna yang tidak ada, supaya waktu respons login tidak membocorkan
// apakah sebuah email terdaftar.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("kata-sandi-tiruan-untuk-menyamakan-waktu");
  return dummyHash;
}

/** Mengembalikan pesan galat, atau null bila kata sandi memenuhi syarat. */
export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Kata sandi maksimal ${MAX_PASSWORD_LENGTH} karakter.`;
  }
  return null;
}

// Tanpa 0/O, 1/l/I supaya mudah dibaca dan diketik saat diberikan ke pengguna.
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateTempPassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
