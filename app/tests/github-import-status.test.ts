// listPullRequestsWithStatus: menggabungkan lib/github-api.ts (dipalsukan) dengan github_imports.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDb } from "@/db/client";
import { pullFromGithub } from "@/lib/admin-entries";
import { insertUserRow, makeTestDb } from "./helpers";

vi.mock("@/lib/github-api", () => ({ listPullRequests: vi.fn() }));
import { listPullRequests } from "@/lib/github-api";
import { listPullRequestsWithStatus } from "@/lib/github-import-status";

let db: AppDb;
let adminId: number;

beforeEach(() => {
  db = makeTestDb();
  adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
  vi.mocked(listPullRequests).mockReset();
});

const pr7 = { number: 7, title: "PR tujuh", url: "https://x/7", state: "open" as const, merged: false, updatedAt: "2026-09-01T00:00:00Z" };
const pr6 = { number: 6, title: "PR enam", url: "https://x/6", state: "closed" as const, merged: true, updatedAt: "2026-08-01T00:00:00Z" };

describe("listPullRequestsWithStatus", () => {
  it("meneruskan galat dari listPullRequests apa adanya, tanpa menyentuh database", async () => {
    vi.mocked(listPullRequests).mockResolvedValue({ ok: false, error: "Batas panggilan GitHub API tercapai." });
    const res = await listPullRequestsWithStatus(db);
    expect(res).toEqual({ ok: false, error: "Batas panggilan GitHub API tercapai." });
  });

  it("PR yang belum pernah ditarik: imports kosong", async () => {
    vi.mocked(listPullRequests).mockResolvedValue({ ok: true, data: [pr7] });
    const res = await listPullRequestsWithStatus(db);
    expect(res).toEqual({ ok: true, data: [{ ...pr7, imports: [] }] });
  });

  it("PR yang sudah ditarik satu kali: imports berisi satu baris dengan entryId yang benar", async () => {
    const pulled = pullFromGithub(
      { number: 7, title: pr7.title, url: pr7.url },
      { title: "T", summary: "", problem: "", forWhom: "", explanation: "", kind: "core", nature: "new" },
      adminId,
      db,
    );
    expect(pulled.ok).toBe(true);
    if (!pulled.ok) return;

    vi.mocked(listPullRequests).mockResolvedValue({ ok: true, data: [pr7, pr6] });
    const res = await listPullRequestsWithStatus(db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byNumber = new Map(res.data.map((p) => [p.number, p]));
    expect(byNumber.get(7)!.imports).toEqual([{ entryId: pulled.id, importedAt: expect.any(Date) }]);
    expect(byNumber.get(6)!.imports).toEqual([]);
  });

  it("PR yang ditarik dua kali: imports berisi dua baris", async () => {
    const first = pullFromGithub(
      { number: 7, title: pr7.title, url: pr7.url },
      { title: "T", summary: "", problem: "", forWhom: "", explanation: "", kind: "core", nature: "new" },
      adminId,
      db,
    );
    const second = pullFromGithub(
      { number: 7, title: pr7.title, url: pr7.url },
      { title: "T", summary: "", problem: "", forWhom: "", explanation: "", kind: "core", nature: "new" },
      adminId,
      db,
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    vi.mocked(listPullRequests).mockResolvedValue({ ok: true, data: [pr7] });
    const res = await listPullRequestsWithStatus(db);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0].imports).toHaveLength(2);
    expect(new Set(res.data[0].imports.map((i) => i.entryId))).toEqual(new Set([first.id, second.id]));
  });
});
