// Umpan balik halaman ("Apakah halaman ini membantu?"): upsert per (entri, pengguna), dan
// hanya untuk Marketing/Partner SUNGGUHAN — Admin ditolak, termasuk saat sedang berpratinjau.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { pageFeedback } from "@/db/schema";
import { createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import { submitFeedback } from "@/lib/feedback";
import { makeTestDb, makeWorld, validInput } from "./helpers";

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  db: undefined as unknown,
  previewCookie: undefined as string | undefined,
}));
vi.mock("@/lib/session", () => ({
  readSessionToken: async () => state.token,
  setSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => state.db,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "pratinjau_peran" && state.previewCookie ? { value: state.previewCookie } : undefined,
  }),
}));

import { submitFeedbackAction } from "@/app/actions/feedback";

async function run(fn: () => Promise<unknown>): Promise<{ redirect: string } | { value: unknown }> {
  try {
    return { value: await fn() };
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return { redirect: digest.split(";")[2] };
    }
    throw error;
  }
}

let db: AppDb;
let world: ReturnType<typeof makeWorld>;
let visibleEntryId: number; // status beta, audiens partner: terlihat Marketing dan Partner
let marketingOnlyId: number; // status beta, audiens marketing: TIDAK terlihat Partner

beforeEach(() => {
  db = makeTestDb();
  state.db = db;
  state.token = undefined;
  state.previewCookie = undefined;
  world = makeWorld(db);

  const a = createEntry({ title: "Fitur A", actorId: world.admin.id }, db);
  if (!a.ok) throw new Error(a.error);
  saveEntry(a.id, validInput({ title: "Fitur A", slug: "fitur-a", status: "beta", audience: "partner" }), world.admin.id, db);
  const pubA = publishEntry(a.id, world.admin.id, db);
  if (!pubA.ok) throw new Error(pubA.error);
  visibleEntryId = a.id;

  const b = createEntry({ title: "Fitur B", actorId: world.admin.id }, db);
  if (!b.ok) throw new Error(b.error);
  saveEntry(b.id, validInput({ title: "Fitur B", slug: "fitur-b", status: "beta", audience: "marketing" }), world.admin.id, db);
  const pubB = publishEntry(b.id, world.admin.id, db);
  if (!pubB.ok) throw new Error(pubB.error);
  marketingOnlyId = b.id;
});

const rowsFor = (entryId: number, userId: number) =>
  db
    .select()
    .from(pageFeedback)
    .where(and(eq(pageFeedback.entryId, entryId), eq(pageFeedback.userId, userId)))
    .all();

describe("submitFeedback (lib): upsert dan validasi ulang akses", () => {
  it("baris baru dibuat saat pertama kali menjawab", () => {
    const res = submitFeedback(
      { viewer: { role: "partner" }, userId: world.partner.id, entryId: visibleEntryId, helpful: true },
      db,
    );
    expect(res).toEqual({ ok: true });
    expect(rowsFor(visibleEntryId, world.partner.id)).toMatchObject([{ helpful: true }]);
  });

  it("menjawab dua kali pada entri yang sama menghasilkan SATU baris (upsert), bukan dua", () => {
    submitFeedback({ viewer: { role: "partner" }, userId: world.partner.id, entryId: visibleEntryId, helpful: true }, db);
    submitFeedback({ viewer: { role: "partner" }, userId: world.partner.id, entryId: visibleEntryId, helpful: false }, db);
    const rows = rowsFor(visibleEntryId, world.partner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].helpful).toBe(false); // jawaban terbaru yang tersimpan
  });

  it("menjawab tiga kali tetap satu baris", () => {
    for (const helpful of [true, false, true]) {
      submitFeedback({ viewer: { role: "marketing" }, userId: world.marketing.id, entryId: visibleEntryId, helpful }, db);
    }
    expect(rowsFor(visibleEntryId, world.marketing.id)).toHaveLength(1);
  });

  it("dua pengguna berbeda pada entri yang sama menghasilkan dua baris terpisah", () => {
    submitFeedback({ viewer: { role: "marketing" }, userId: world.marketing.id, entryId: visibleEntryId, helpful: true }, db);
    submitFeedback({ viewer: { role: "partner" }, userId: world.partner.id, entryId: visibleEntryId, helpful: false }, db);
    expect(db.select().from(pageFeedback).where(eq(pageFeedback.entryId, visibleEntryId)).all()).toHaveLength(2);
  });

  it("satu pengguna pada dua entri berbeda menghasilkan dua baris terpisah", () => {
    submitFeedback({ viewer: { role: "marketing" }, userId: world.marketing.id, entryId: visibleEntryId, helpful: true }, db);
    submitFeedback({ viewer: { role: "marketing" }, userId: world.marketing.id, entryId: marketingOnlyId, helpful: false }, db);
    expect(db.select().from(pageFeedback).where(eq(pageFeedback.userId, world.marketing.id)).all()).toHaveLength(2);
  });

  it("entri yang tidak boleh dilihat viewer ditolak dan tidak menulis apa pun", () => {
    const before = db.select().from(pageFeedback).all();
    const res = submitFeedback(
      { viewer: { role: "partner" }, userId: world.partner.id, entryId: marketingOnlyId, helpful: true },
      db,
    );
    expect(res).toEqual({ ok: false, error: "Entri tidak ditemukan." });
    expect(db.select().from(pageFeedback).all()).toEqual(before);
  });

  it("entri yang tidak ada ditolak", () => {
    expect(
      submitFeedback({ viewer: { role: "partner" }, userId: world.partner.id, entryId: 999999, helpful: true }, db),
    ).toEqual({ ok: false, error: "Entri tidak ditemukan." });
  });
});

describe("submitFeedbackAction: hanya Marketing/Partner sungguhan", () => {
  it("Admin (akun asli) ditolak, dan tidak ada baris ditulis", async () => {
    state.token = world.tokens.admin;
    const before = db.select().from(pageFeedback).all();
    const res = await submitFeedbackAction(visibleEntryId, true);
    expect(res).toEqual({ ok: false, error: "Umpan balik hanya untuk tim marketing dan partner." });
    expect(db.select().from(pageFeedback).all()).toEqual(before);
  });

  it("Admin yang SEDANG BERPRATINJAU sebagai Marketing atau Partner tetap ditolak", async () => {
    state.token = world.tokens.admin;
    const before = db.select().from(pageFeedback).all();
    for (const preview of ["marketing", "partner"] as const) {
      state.previewCookie = preview;
      const res = await submitFeedbackAction(visibleEntryId, true);
      expect(res, preview).toEqual({ ok: false, error: "Umpan balik hanya untuk tim marketing dan partner." });
    }
    expect(db.select().from(pageFeedback).all()).toEqual(before);
  });

  it("Marketing sungguhan berhasil", async () => {
    state.token = world.tokens.marketing;
    const res = await submitFeedbackAction(visibleEntryId, true);
    expect(res).toEqual({ ok: true });
    expect(rowsFor(visibleEntryId, world.marketing.id)).toMatchObject([{ helpful: true }]);
  });

  it("Partner sungguhan berhasil", async () => {
    state.token = world.tokens.partner;
    const res = await submitFeedbackAction(visibleEntryId, false);
    expect(res).toEqual({ ok: true });
    expect(rowsFor(visibleEntryId, world.partner.id)).toMatchObject([{ helpful: false }]);
  });

  it("kirim dua kali lewat aksi (klik Ya lalu Tidak) menghasilkan satu baris, bukan dua", async () => {
    state.token = world.tokens.marketing;
    await submitFeedbackAction(visibleEntryId, true);
    await submitFeedbackAction(visibleEntryId, false);
    const rows = rowsFor(visibleEntryId, world.marketing.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].helpful).toBe(false);
  });

  it("Partner ditolak untuk entri yang beraudiens Marketing saja, dan tidak ada baris ditulis", async () => {
    state.token = world.tokens.partner;
    const before = db.select().from(pageFeedback).all();
    const res = await submitFeedbackAction(marketingOnlyId, true);
    expect(res).toEqual({ ok: false, error: "Entri tidak ditemukan." });
    expect(db.select().from(pageFeedback).all()).toEqual(before);
  });

  it("entryId tidak valid ditolak sebelum menyentuh database", async () => {
    state.token = world.tokens.marketing;
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(await submitFeedbackAction(bad, true), String(bad)).toEqual({ ok: false, error: "Entri tidak valid." });
    }
    expect(db.select().from(pageFeedback).all()).toEqual([]);
  });

  it("tanpa sesi: dialihkan ke /masuk, tidak ada yang ditulis", async () => {
    state.token = undefined;
    const before = db.select().from(pageFeedback).all();
    expect(await run(() => submitFeedbackAction(visibleEntryId, true))).toEqual({ redirect: "/masuk" });
    expect(db.select().from(pageFeedback).all()).toEqual(before);
  });

  it("sesi palsu: dialihkan ke /masuk", async () => {
    state.token = "token-tidak-valid";
    expect(await run(() => submitFeedbackAction(visibleEntryId, true))).toEqual({ redirect: "/masuk" });
  });
});
