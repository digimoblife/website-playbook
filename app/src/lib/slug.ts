import { LIMITS } from "./domain";

// Huruf kecil dan angka dipisah satu tanda hubung; tanpa tanda hubung di ujung.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Membuat slug dari judul: huruf kecil, tanpa aksen, selain huruf dan angka menjadi tanda hubung. */
export function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = base.slice(0, LIMITS.slug).replace(/-+$/g, "");
  return cut || "entri";
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= LIMITS.slug && SLUG_PATTERN.test(slug);
}
