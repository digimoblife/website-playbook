// Webhook GitHub (Langkah 6c): rute sungguhan dipanggil dengan kiriman palsu bertanda tangan.
// Tidak ada panggilan jaringan; database di memori.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDb } from "@/db/client";
import { entries, githubChanges, webhookDeliveries } from "@/db/schema";
import { isPullRequestMergeCommit, verifySignature } from "@/lib/github-webhook";
import { createEntryFromCommit, listNewGithubChanges, markGithubChangeReviewed } from "@/lib/github-changes";
import { insertUserRow, makeTestDb } from "./helpers";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => state.db,
}));

import { POST } from "@/app/api/github/webhook/route";

const SECRET = "rahasia-webhook-uji";
const REPO = { full_name: "bajaklautmalaka/lapaq", default_branch: "main" };
const ORIGINAL_ENV = { ...process.env };
let db: AppDb;
let delivery = 0;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, GITHUB_WEBHOOK_SECRET: SECRET, GITHUB_REPO: "bajaklautmalaka/lapaq" };
  db = makeTestDb();
  state.db = db;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function send(
  event: string,
  payload: unknown,
  opts: { signature?: string | null; deliveryId?: string; raw?: string } = {},
) {
  const body = opts.raw ?? JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": event,
    "x-github-delivery": opts.deliveryId ?? `kirim-${++delivery}`,
  };
  const signature = opts.signature === undefined ? sign(body) : opts.signature;
  if (signature !== null) headers["x-hub-signature-256"] = signature;
  const res = await POST(new Request("http://localhost/api/github/webhook", { method: "POST", headers, body }));
  return { status: res.status, text: await res.text() };
}

const mergedPr = (over: object = {}) => ({
  action: "closed",
  repository: REPO,
  pull_request: {
    number: 12,
    title: "feat(stok): kunci stok saat checkout",
    body: "Fitur: kunci-stok",
    html_url: "https://github.com/bajaklautmalaka/lapaq/pull/12",
    merged: true,
    merged_at: "2026-09-27T03:00:00Z",
    base: { ref: "main" },
    ...over,
  },
});

const push = (commits: object[], ref = "refs/heads/main") => ({ ref, repository: REPO, commits });
const commit = (id: string, message: string, over: object = {}) => ({
  id,
  message,
  url: `https://github.com/bajaklautmalaka/lapaq/commit/${id}`,
  timestamp: "2026-09-27T04:00:00Z",
  distinct: true,
  added: ["src/app/stok/page.tsx"],
  modified: ["src/lib/stok.ts"],
  removed: [],
  ...over,
});

describe("Keamanan", () => {
  it("tanpa GITHUB_WEBHOOK_SECRET: semua ditolak (503) dan tidak ada yang tersimpan", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    expect((await send("pull_request", mergedPr())).status).toBe(503);
    expect(db.select().from(githubChanges).all()).toEqual([]);
  });

  it("tanda tangan salah, hilang, atau dari rahasia lain: 401 dan tidak ada yang tersimpan", async () => {
    const body = JSON.stringify(mergedPr());
    for (const signature of [null, "sha256=00", sign(body, "rahasia-lain"), "sha1=abc"]) {
      expect((await send("pull_request", mergedPr(), { signature })).status, String(signature)).toBe(401);
    }
    expect(db.select().from(githubChanges).all()).toEqual([]);
    expect(db.select().from(webhookDeliveries).all()).toEqual([]);
  });

  it("isi diubah setelah ditandatangani: 401", async () => {
    const original = JSON.stringify(mergedPr());
    const tampered = JSON.stringify(mergedPr({ title: "judul lain" }));
    expect((await send("pull_request", null, { raw: tampered, signature: sign(original) })).status).toBe(401);
  });

  it("repo lain diabaikan walau tanda tangannya sah", async () => {
    const other = { ...mergedPr(), repository: { full_name: "orang-lain/produk", default_branch: "main" } };
    expect((await send("pull_request", other)).status).toBe(202);
    expect(db.select().from(githubChanges).all()).toEqual([]);
  });

  it("jawaban tidak memuat isi database", async () => {
    await send("pull_request", mergedPr());
    const res = await send("pull_request", mergedPr({ number: 13 }));
    expect(res.text).not.toContain("kunci stok");
  });

  it("verifySignature: header kosong atau rahasia kosong selalu gagal", () => {
    const body = new TextEncoder().encode("{}");
    expect(verifySignature("", body, sign("{}", ""))).toBe(false);
    expect(verifySignature(SECRET, body, null)).toBe(false);
    expect(verifySignature(SECRET, body, sign("{}"))).toBe(true);
  });
});

describe("Pull request", () => {
  it("ping dijawab tanpa menyimpan apa pun", async () => {
    expect(await send("ping", { zen: "hai", repository: REPO })).toEqual({ status: 200, text: "pong" });
  });

  it("PR yang di-merge ke main dicatat sebagai perubahan baru", async () => {
    expect((await send("pull_request", mergedPr())).status).toBe(200);
    const [row] = listNewGithubChanges("kandidat", db);
    expect(row).toMatchObject({
      kind: "pr",
      prNumber: 12,
      repo: "bajaklautmalaka/lapaq",
      title: "feat(stok): kunci stok saat checkout",
      url: "https://github.com/bajaklautmalaka/lapaq/pull/12",
      happenedAt: new Date("2026-09-27T03:00:00Z"),
    });
  });

  it("PR ditutup tanpa merge, PR ke branch lain, dan PR dibuka: diabaikan", async () => {
    await send("pull_request", mergedPr({ merged: false }));
    await send("pull_request", mergedPr({ base: { ref: "develop" } }));
    await send("pull_request", { ...mergedPr(), action: "opened" });
    expect(db.select().from(githubChanges).all()).toEqual([]);
  });

  it("kiriman ulang (ID pengiriman sama) dan PR yang sama dari pengiriman lain tidak dobel", async () => {
    await send("pull_request", mergedPr(), { deliveryId: "sama" });
    expect((await send("pull_request", mergedPr(), { deliveryId: "sama" })).text).toBe("Sudah pernah diterima.");
    expect((await send("pull_request", mergedPr(), { deliveryId: "lain" })).text).toBe("PR #12 sudah tercatat sebelumnya.");
    expect(db.select().from(githubChanges).all()).toHaveLength(1);
  });
});

describe("Push ke branch utama", () => {
  it("commit langsung masuk daftar perlu ditinjau beserta nama file; merge commit PR dilewati", async () => {
    const res = await send(
      "push",
      push([
        commit("a".repeat(40), "fix: perbaiki typo\n\nDetail perbaikan"),
        commit("b".repeat(40), "Merge pull request #12 from cabang/fitur"),
        commit("c".repeat(40), "feat(stok): kunci stok (#12)"),
        commit("d".repeat(40), "ubah warna tombol", { distinct: false }),
      ]),
    );
    expect(res).toEqual({ status: 200, text: "1 commit langsung dicatat." });
    // Bertipe fix, jadi masuk Perbaikan (Langkah 6d), bukan kandidat.
    expect(listNewGithubChanges("kandidat", db)).toEqual([]);
    const [row] = listNewGithubChanges("perbaikan", db);
    expect(row).toMatchObject({
      kind: "commit",
      commitSha: "a".repeat(40),
      title: "fix: perbaiki typo",
      files: ["src/app/stok/page.tsx", "src/lib/stok.ts"],
    });
  });

  it("push ke branch lain diabaikan; sha yang tidak sah dilewati", async () => {
    await send("push", push([commit("e".repeat(40), "wip")], "refs/heads/fitur-baru"));
    await send("push", push([commit("bukan-sha", "aneh")]));
    expect(db.select().from(githubChanges).all()).toEqual([]);
  });

  it("isPullRequestMergeCommit", () => {
    expect(isPullRequestMergeCommit("Merge pull request #7 from a/b\n\nisi")).toBe(true);
    expect(isPullRequestMergeCommit("feat: sesuatu (#7)")).toBe(true);
    expect(isPullRequestMergeCommit("fix: bug #7 di checkout")).toBe(false);
  });
});

describe("Tindak lanjut di Inbox", () => {
  it("tandai ditinjau: hilang dari daftar baru", async () => {
    await send("pull_request", mergedPr());
    const adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
    const [row] = listNewGithubChanges("kandidat", db);
    expect(markGithubChangeReviewed(row.id, adminId, db).ok).toBe(true);
    expect(listNewGithubChanges("kandidat", db)).toEqual([]);
    expect(markGithubChangeReviewed(row.id, adminId, db).ok).toBe(false);
  });

  it("buat entri dari commit: entri Internal, belum terbit, berjudul pesan commit, dan tertaut", async () => {
    await send("push", push([commit("f".repeat(40), "feat: " + "x".repeat(200))]));
    const adminId = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" }).id;
    const [row] = listNewGithubChanges("kandidat", db);
    const r = createEntryFromCommit(row.id, adminId, db);
    expect(r.ok).toBe(true);
    const entry = db.select().from(entries).get()!;
    expect(entry).toMatchObject({ status: "internal", audience: "internal", isPublished: false });
    expect(entry.title.length).toBe(120);
    expect(db.select().from(githubChanges).get()).toMatchObject({ state: "ditinjau", entryId: entry.id });
    expect(listNewGithubChanges("kandidat", db)).toEqual([]);
  });
});
