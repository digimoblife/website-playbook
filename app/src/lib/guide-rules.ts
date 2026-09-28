// Aturan murni panduan skenario (tanpa database), dipakai server (lib/guides.ts) dan editor klien.
// Siapa yang boleh melihat apa TIDAK ditentukan di sini, melainkan oleh lib/access.ts.
import { readersWhoCanView } from "./access";
import type { Audience, Role, Status } from "./domain";
import { PUBLISH_INVISIBLE_MESSAGE } from "./publish";

export type GuideStepInput = { text: string; entryId: number | null };

export type GuideInput = {
  title: string;
  slug: string;
  summary: string;
  intro: string;
  status: Status;
  audience: Audience;
  steps: GuideStepInput[];
};

export type LinkableEntry = {
  id: number;
  title: string;
  /** Peran pembaca yang SAAT INI bisa membuka halaman fitur ini. */
  readers: Role[];
};

type GuidePublishFields = { summary: string; status: Status; audience: Audience };

/** Bagian yang masih kurang agar panduan yang AKAN terlihat pembaca boleh dipublish. */
export function missingForGuidePublish(guide: GuidePublishFields, stepCount: number): string[] {
  if (readersWhoCanView(guide).length === 0) return [];
  const missing: string[] = [];
  if (!guide.summary.trim()) missing.push("Ringkasan");
  if (stepCount < 1) missing.push("Langkah (minimal satu)");
  return missing;
}

/** Alasan Publish ditolak, atau null bila boleh. Sama seperti publishBlocker untuk entri. */
export function guidePublishBlocker(guide: GuidePublishFields, stepCount: number): string | null {
  if (readersWhoCanView(guide).length === 0) return PUBLISH_INVISIBLE_MESSAGE;
  const missing = missingForGuidePublish(guide, stepCount);
  return missing.length > 0
    ? `Belum bisa dipublish karena panduan ini akan terlihat oleh pembaca. Lengkapi dulu: ${missing.join(", ")}.`
    : null;
}

/**
 * Peringatan untuk editor: langkah yang menautkan fitur yang TIDAK terlihat oleh sebagian
 * pembaca panduan ini. Pembaca itu tetap melihat teks langkahnya, hanya tanpa tautan.
 */
export function guideLinkWarnings(
  guide: Pick<GuideInput, "status" | "audience" | "steps">,
  linkable: LinkableEntry[],
): string[] {
  const guideReaders = readersWhoCanView(guide);
  const byId = new Map(linkable.map((entry) => [entry.id, entry]));
  const warnings: string[] = [];
  guide.steps.forEach((step, index) => {
    if (step.entryId === null) return;
    const entry = byId.get(step.entryId);
    const missing = guideReaders.filter((role) => !entry?.readers.includes(role));
    if (missing.length > 0) {
      const who = missing.map((role) => (role === "partner" ? "Partner" : "Marketing")).join(" dan ");
      warnings.push(
        `Langkah ${index + 1}: fitur yang ditautkan belum terlihat oleh ${who}, jadi mereka hanya melihat teks langkahnya tanpa tautan.`,
      );
    }
  });
  return warnings;
}
