// lib/github-api.ts: fetch GLOBAL dipalsukan sepenuhnya. Tidak ada panggilan jaringan sungguhan.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPullRequestDetail, listPullRequests } from "@/lib/github-api";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, GITHUB_TOKEN: "token-uji", GITHUB_REPO: "bajaklautmalaka/lapaq" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("listPullRequests", () => {
  it("mengubah bentuk mentah GitHub menjadi PullRequestSummary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, [
        { number: 7, title: "PR tujuh", html_url: "https://github.com/x/pulls/7", state: "open", merged_at: null, updated_at: "2026-09-01T00:00:00Z", body: null },
        { number: 6, title: "PR enam", html_url: "https://github.com/x/pulls/6", state: "closed", merged_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z", body: "isi" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await listPullRequests();
    expect(res).toEqual({
      ok: true,
      data: [
        { number: 7, title: "PR tujuh", url: "https://github.com/x/pulls/7", state: "open", merged: false, updatedAt: "2026-09-01T00:00:00Z" },
        { number: 6, title: "PR enam", url: "https://github.com/x/pulls/6", state: "closed", merged: true, updatedAt: "2026-08-01T00:00:00Z" },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/repos/bajaklautmalaka/lapaq/pulls");
    expect(url).toContain("state=all");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-uji");
  });

  it("401 -> pesan token tidak valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    const res = await listPullRequests();
    expect(res).toEqual({ ok: false, error: expect.stringContaining("GITHUB_TOKEN") });
  });

  it("403 dengan rate limit habis -> pesan jelas menyebut batas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(403, {}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" })),
    );
    const res = await listPullRequests();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/[Bb]atas panggilan/);
  });

  it("403 tanpa indikasi rate limit -> pesan galat lain, bukan diam-diam retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, {}));
    vi.stubGlobal("fetch", fetchMock);
    const res = await listPullRequests();
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // tidak retry berulang
  });

  it("kegagalan jaringan -> pesan jelas, bukan melempar exception mentah", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const res = await listPullRequests();
    expect(res).toEqual({ ok: false, error: expect.stringContaining("Tidak bisa terhubung") });
  });
});

describe("getPullRequestDetail", () => {
  it("menggabungkan detail PR dan nama file (bukan isi diff)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/files")) {
        return jsonResponse(200, [{ filename: "src/a.ts", patch: "RAHASIA-DIFF" }, { filename: "src/b.ts" }]);
      }
      return jsonResponse(200, {
        number: 7, title: "PR tujuh", html_url: "https://github.com/x/pulls/7",
        state: "open", merged_at: null, updated_at: "2026-09-01T00:00:00Z", body: "deskripsi PR",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await getPullRequestDetail(7);
    expect(res).toEqual({
      ok: true,
      data: {
        number: 7, title: "PR tujuh", url: "https://github.com/x/pulls/7", state: "open",
        merged: false, updatedAt: "2026-09-01T00:00:00Z", body: "deskripsi PR",
        files: ["src/a.ts", "src/b.ts"],
      },
    });
    // Isi diff (patch) tidak pernah dibaca ke dalam hasil.
    expect(JSON.stringify(res)).not.toContain("RAHASIA-DIFF");
  });

  it("404 pada detail PR -> galat, tidak lanjut memanggil endpoint file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getPullRequestDetail(999);
    expect(res.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
