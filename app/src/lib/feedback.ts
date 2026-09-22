// Umpan balik halaman fitur ("Apakah halaman ini membantu?"). Fungsi ini TIDAK memeriksa siapa
// pemanggilnya atau perannya — itu tugas Server Action (app/actions/feedback.ts), yang menolak
// Admin (termasuk saat pratinjau) sebelum sampai ke sini. Modul ini hanya memvalidasi ulang
// bahwa entrinya boleh dilihat viewer yang mengirim, lewat getEntryBySlugFor (lib/entries.ts) —
// satu-satunya sumber aturan akses, tidak diduplikasi di sini.
import { getDb, type AppDb } from "@/db/client";
import { pageFeedback } from "@/db/schema";
import type { Viewer } from "@/lib/access";
import { getEntryBySlugFor, getEntrySlugById } from "@/lib/entries";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

export function submitFeedback(
  input: { viewer: Viewer; userId: number; entryId: number; helpful: boolean },
  db: AppDb = getDb(),
): FeedbackResult {
  const slug = getEntrySlugById(input.entryId, db);
  const entry = slug ? getEntryBySlugFor(input.viewer, slug, db) : null;
  if (!entry) return { ok: false, error: "Entri tidak ditemukan." };

  const now = new Date();
  db.insert(pageFeedback)
    .values({ entryId: entry.id, userId: input.userId, helpful: input.helpful, at: now })
    .onConflictDoUpdate({
      target: [pageFeedback.entryId, pageFeedback.userId],
      set: { helpful: input.helpful, at: now },
    })
    .run();
  return { ok: true };
}
