"use server";

import { requireUser } from "@/lib/dal";
import { submitFeedback, type FeedbackResult } from "@/lib/feedback";

// Umpan balik ini mengukur pembaca SUNGGUHAN, jadi Admin ditolak di sini — termasuk saat
// Admin sedang berpratinjau sebagai Marketing/Partner. Pemeriksaan memakai peran AKUN asli
// (user.role dari sesi login), bukan viewer sintetis dari lib/preview.ts.
export async function submitFeedbackAction(entryId: number, helpful: boolean): Promise<FeedbackResult> {
  const user = await requireUser();
  if (user.role !== "marketing" && user.role !== "partner") {
    return { ok: false, error: "Umpan balik hanya untuk tim marketing dan partner." };
  }
  if (!Number.isInteger(entryId) || entryId < 1) {
    return { ok: false, error: "Entri tidak valid." };
  }
  return submitFeedback({ viewer: user, userId: user.id, entryId, helpful });
}
