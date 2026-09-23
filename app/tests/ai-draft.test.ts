// lib/ai-draft.ts: TIDAK PERNAH memanggil AI sungguhan. callApi selalu disuntik palsu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateAiDraft } from "@/lib/ai-draft";

const ORIGINAL_ENV = { ...process.env };
const input = { prTitle: "Tambah kunci stok", prBody: "Deskripsi PR", files: ["src/a.ts"] };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("generateAiDraft: konfigurasi", () => {
  it("AI_API_KEY kosong -> unavailable, TIDAK memanggil callApi", async () => {
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    const callApi = vi.fn();
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("unavailable");
    expect(callApi).not.toHaveBeenCalled();
  });

  it("AI_API_KEY diisi tetapi AI_MODEL kosong -> unavailable, TIDAK memanggil callApi", async () => {
    process.env.AI_API_KEY = "kunci-uji";
    delete process.env.AI_MODEL;
    const callApi = vi.fn();
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("unavailable");
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe("generateAiDraft: berhasil", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "kunci-uji";
    process.env.AI_MODEL = "model-uji";
  });

  it("JSON valid dari AI -> draf terpakai apa adanya (dipangkas sesuai LIMITS)", async () => {
    const callApi = vi.fn().mockResolvedValue(
      JSON.stringify({
        title: "Kunci stok",
        summary: "Ringkasan",
        problem: "Masalah",
        forWhom: "Toko besar",
        explanation: "Penjelasan",
        kind: "addon",
        nature: "update",
      }),
    );
    const res = await generateAiDraft(input, { callApi });
    expect(res).toEqual({
      status: "ok",
      draft: {
        title: "Kunci stok",
        summary: "Ringkasan",
        problem: "Masalah",
        forWhom: "Toko besar",
        explanation: "Penjelasan",
        kind: "addon",
        nature: "update",
      },
    });
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("AI membungkus JSON dengan fence markdown -> tetap ter-parse", async () => {
    const callApi = vi.fn().mockResolvedValue('```json\n{"title":"T","summary":"","problem":"","forWhom":"","explanation":"","kind":"core","nature":"new"}\n```');
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("ok");
  });

  it("kind/nature asing dari AI diganti default aman (core/new), bukan ditolak", async () => {
    const callApi = vi.fn().mockResolvedValue(
      JSON.stringify({ title: "T", summary: "", problem: "", forWhom: "", explanation: "", kind: "modul-aneh", nature: "entah" }),
    );
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.draft.kind).toBe("core");
      expect(res.draft.nature).toBe("new");
    }
  });

  it("AI mencoba menyisipkan status/audience -> field itu tidak pernah muncul di draf (tidak ada di tipe)", async () => {
    const callApi = vi.fn().mockResolvedValue(
      JSON.stringify({
        title: "T", summary: "", problem: "", forWhom: "", explanation: "", kind: "core", nature: "new",
        status: "siap", audience: "partner",
      }),
    );
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("ok");
    expect(res).not.toHaveProperty("draft.status");
    expect(res).not.toHaveProperty("draft.audience");
  });
});

describe("generateAiDraft: gagal", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "kunci-uji";
    process.env.AI_MODEL = "model-uji";
  });

  it("callApi melempar error -> status error, pesan jelas, tidak retry berulang", async () => {
    const callApi = vi.fn().mockRejectedValue(new Error("jaringan mati"));
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("error");
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("JSON rusak -> tepat SATU percobaan ulang, lalu error bila tetap rusak", async () => {
    const callApi = vi.fn().mockResolvedValue("bukan json sama sekali");
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("error");
    expect(callApi).toHaveBeenCalledTimes(2); // percobaan pertama + satu retry
  });

  it("JSON rusak lalu berhasil pada percobaan ulang -> status ok", async () => {
    const callApi = vi
      .fn()
      .mockResolvedValueOnce("rusak")
      .mockResolvedValueOnce(JSON.stringify({ title: "T", summary: "", problem: "", forWhom: "", explanation: "", kind: "core", nature: "new" }));
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("ok");
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it("JSON valid tapi tanpa title -> dianggap tidak terpakai (title wajib)", async () => {
    const callApi = vi.fn().mockResolvedValue(JSON.stringify({ summary: "s" }));
    const res = await generateAiDraft(input, { callApi });
    expect(res.status).toBe("error");
  });
});
