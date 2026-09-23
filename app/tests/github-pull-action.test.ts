// pullFromGithubAction: DAL asli (Admin-only), github-api dan ai-draft dipalsukan modulnya —
// TIDAK PERNAH memanggil GitHub atau AI sungguhan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { entries, githubImports } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { insertUserRow, makeTestDb, snapshot } from "./helpers";

const state = vi.hoisted(() => ({
  token: undefined as string | undefined,
  db: undefined as unknown,
}));
vi.mock("@/lib/session", () => ({
  readSessionToken: async () => state.token,
  setSessionCookie: async () => {},
  clearSessionCookie: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => state.db,
}));

const githubMock = vi.hoisted(() => ({ getPullRequestDetail: vi.fn() }));
vi.mock("@/lib/github-api", () => ({ getPullRequestDetail: githubMock.getPullRequestDetail }));

const aiMock = vi.hoisted(() => ({ generateAiDraft: vi.fn() }));
vi.mock("@/lib/ai-draft", () => ({ generateAiDraft: aiMock.generateAiDraft }));

import { pullFromGithubAction } from "@/app/admin/github/actions";

type Outcome = { redirect: string } | { value: unknown };
async function run(fn: () => Promise<unknown>): Promise<Outcome> {
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

const prDetail = {
  number: 7,
  title: "Tambah kunci stok",
  url: "https://github.com/x/pulls/7",
  state: "open" as const,
  merged: false,
  updatedAt: "2026-09-01T00:00:00Z",
  body: "deskripsi",
  files: ["src/a.ts"],
};

const okDraft = {
  status: "ok" as const,
  draft: {
    title: "Kunci stok",
    summary: "Ringkasan",
    problem: "Masalah",
    forWhom: "Toko",
    explanation: "Penjelasan",
    kind: "core" as const,
    nature: "new" as const,
  },
};

let db: AppDb;
let adminId: number;
let marketingId: number;
let partnerId: number;

beforeEach(() => {
  db = makeTestDb();
  state.db = db;
  state.token = undefined;
  vi.clearAllMocks();

  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  marketingId = insertUserRow(db, { email: "marketing@uji.lokal", role: "marketing" }).id;
  partnerId = insertUserRow(db, { email: "partner@uji.lokal", role: "partner" }).id;

  githubMock.getPullRequestDetail.mockResolvedValue({ ok: true, data: prDetail });
  aiMock.generateAiDraft.mockResolvedValue(okDraft);
});

describe("pullFromGithubAction: akses", () => {
  it("Marketing ditolak, database tidak berubah, GitHub/AI tidak pernah dipanggil", async () => {
    state.token = createSession(marketingId, db).token;
    const before = snapshot(db);
    const res = await run(() => pullFromGithubAction(7));
    expect(res).toEqual({ redirect: "/" });
    expect(snapshot(db)).toBe(before);
    expect(githubMock.getPullRequestDetail).not.toHaveBeenCalled();
    expect(aiMock.generateAiDraft).not.toHaveBeenCalled();
  });

  it("Partner ditolak, database tidak berubah", async () => {
    state.token = createSession(partnerId, db).token;
    const before = snapshot(db);
    const res = await run(() => pullFromGithubAction(7));
    expect(res).toEqual({ redirect: "/" });
    expect(snapshot(db)).toBe(before);
  });

  it("tanpa sesi: dialihkan ke /masuk", async () => {
    state.token = undefined;
    const res = await run(() => pullFromGithubAction(7));
    expect(res).toEqual({ redirect: "/masuk" });
  });

  it("Admin berhasil menarik", async () => {
    state.token = createSession(adminId, db).token;
    const res = await pullFromGithubAction(7);
    expect(res.ok).toBe(true);
  });
});

describe("pullFromGithubAction: hasil selalu Internal/Internal", () => {
  beforeEach(() => {
    state.token = createSession(adminId, db).token;
  });

  it("entri yang dibuat berstatus dan beraudiens internal, apa pun yang 'disarankan' mock AI", async () => {
    aiMock.generateAiDraft.mockResolvedValue({
      status: "ok",
      draft: { ...okDraft.draft, status: "siap", audience: "partner" },
    });
    const res = await pullFromGithubAction(7);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = db.select().from(entries).where(eq(entries.id, res.entryId)).get();
    expect(row?.status).toBe("internal");
    expect(row?.audience).toBe("internal");
  });
});

describe("pullFromGithubAction: AI tidak tersedia atau gagal", () => {
  beforeEach(() => {
    state.token = createSession(adminId, db).token;
  });

  it("AI_API_KEY kosong (mock unavailable) -> pesan jelas, tidak ada entri atau github_imports dibuat", async () => {
    aiMock.generateAiDraft.mockResolvedValue({ status: "unavailable", message: "Draf AI belum aktif." });
    const before = snapshot(db);
    const res = await pullFromGithubAction(7);
    expect(res).toEqual({ ok: false, error: "Draf AI belum aktif." });
    expect(snapshot(db)).toBe(before);
  });

  it("AI error (mock melempar / format rusak) -> tidak ada entri dibuat, tidak ada baris github_imports", async () => {
    aiMock.generateAiDraft.mockResolvedValue({ status: "error", message: "AI gagal." });
    const before = snapshot(db);
    const res = await pullFromGithubAction(7);
    expect(res).toEqual({ ok: false, error: "AI gagal." });
    expect(snapshot(db)).toBe(before);
  });

  it("GitHub gagal diambil -> pesan galat GitHub diteruskan, AI tidak dipanggil", async () => {
    githubMock.getPullRequestDetail.mockResolvedValue({ ok: false, error: "Batas panggilan GitHub API tercapai." });
    const res = await pullFromGithubAction(7);
    expect(res).toEqual({ ok: false, error: "Batas panggilan GitHub API tercapai." });
    expect(aiMock.generateAiDraft).not.toHaveBeenCalled();
  });
});

describe("pullFromGithubAction: PR ditarik dua kali", () => {
  it("dua panggilan berturut-turut menghasilkan dua entri dan dua baris github_imports", async () => {
    state.token = createSession(adminId, db).token;
    const first = await pullFromGithubAction(7);
    const second = await pullFromGithubAction(7);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.entryId).not.toBe(second.entryId);
    const rows = db.select().from(githubImports).where(eq(githubImports.prNumber, 7)).all();
    expect(rows).toHaveLength(2);
  });
});

describe("pullFromGithubAction: nomor PR tidak valid", () => {
  it("ditolak sebelum memanggil GitHub", async () => {
    state.token = createSession(adminId, db).token;
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      const res = await pullFromGithubAction(bad);
      expect(res, String(bad)).toEqual({ ok: false, error: "Nomor PR tidak valid." });
    }
    expect(githubMock.getPullRequestDetail).not.toHaveBeenCalled();
  });
});
