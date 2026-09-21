import { describe, expect, it } from "vitest";
import {
  missingForPublish,
  PUBLISH_INVISIBLE_MESSAGE,
  publicationSummary,
  publishBlockedMessage,
  publishBlocker,
} from "@/lib/publish";

const full = { summary: "R", canPromise: "B", cannotPromise: "J", status: "beta", audience: "partner" } as const;

describe("missingForPublish", () => {
  it("lengkap: tidak ada yang kurang", () => {
    expect(missingForPublish(full, 1)).toEqual([]);
  });

  it("setiap syarat yang kurang disebut sendiri", () => {
    expect(missingForPublish({ ...full, summary: "  " }, 1)).toEqual(["Ringkasan"]);
    expect(missingForPublish(full, 0)).toEqual(["Cara pakai (minimal satu langkah)"]);
    expect(missingForPublish({ ...full, canPromise: "" }, 1)).toEqual(["Boleh dijanjikan"]);
    expect(missingForPublish({ ...full, cannotPromise: "" }, 1)).toEqual(["Jangan dijanjikan"]);
  });

  it("semua kurang: semuanya disebut", () => {
    const empty = { ...full, summary: "", canPromise: "", cannotPromise: "" };
    expect(missingForPublish(empty, 0)).toHaveLength(4);
    expect(publishBlockedMessage(missingForPublish(empty, 0))).toContain("Ringkasan, Cara pakai");
  });

  it("entri yang tidak akan terlihat pembaca tidak punya daftar 'kurang' (alasannya lain: lihat publishBlocker)", () => {
    const empty = { summary: "", canPromise: "", cannotPromise: "" };
    expect(missingForPublish({ ...empty, status: "internal", audience: "partner" }, 0)).toEqual([]);
    expect(missingForPublish({ ...empty, status: "siap", audience: "internal" }, 0)).toEqual([]);
    expect(missingForPublish({ ...empty, status: "internal", audience: "internal" }, 0)).toEqual([]);
  });

  it("audiens Marketing saja tetap mensyaratkan kelengkapan (Marketing akan melihatnya)", () => {
    expect(missingForPublish({ ...full, audience: "marketing", summary: "" }, 1)).toEqual(["Ringkasan"]);
  });
});

describe("publicationSummary: teks persis sesuai spesifikasi", () => {
  const base = { isPublished: false, archived: false };

  it("sebelum publish, terlihat", () => {
    expect(publicationSummary({ ...base, status: "beta", audience: "partner" })).toBe(
      "Setelah Publish: tampil ke Marketing dan Partner sebagai Beta.",
    );
    expect(publicationSummary({ ...base, status: "siap", audience: "marketing" })).toBe(
      "Setelah Publish: tampil ke Marketing sebagai Siap diumumkan.",
    );
  });

  it("sebelum publish, tidak terlihat", () => {
    const text = "Masih Internal: belum akan tampil ke pembaca mana pun.";
    expect(publicationSummary({ ...base, status: "internal", audience: "partner" })).toBe(text);
    expect(publicationSummary({ ...base, status: "beta", audience: "internal" })).toBe(text);
  });

  it("setelah publish, terlihat", () => {
    expect(publicationSummary({ isPublished: true, archived: false, status: "siap", audience: "partner" })).toBe(
      "Diterbitkan. Tampil ke Marketing dan Partner sebagai Siap diumumkan.",
    );
  });

  it("setelah publish, tidak terlihat", () => {
    expect(publicationSummary({ isPublished: true, archived: false, status: "internal", audience: "partner" })).toBe(
      "Tersimpan sebagai draf internal. Belum tampil ke pembaca mana pun.",
    );
  });

  it("terarsip", () => {
    expect(publicationSummary({ isPublished: false, archived: true, status: "siap", audience: "partner" })).toBe(
      "Diarsipkan. Tidak tampil ke pembaca mana pun.",
    );
  });
});

describe("publishBlocker: satu-satunya pintu keputusan boleh-tidaknya publish", () => {
  const MESSAGE = "Ubah status dan audiens dari Internal dulu, baru Publish. Untuk menyimpan tanpa menampilkan, pakai Simpan.";

  it("pesan penolakan persis sesuai spesifikasi", () => {
    expect(PUBLISH_INVISIBLE_MESSAGE).toBe(MESSAGE);
  });

  it.each([
    ["internal", "internal"],
    ["internal", "marketing"],
    ["internal", "partner"],
    ["beta", "internal"],
    ["siap", "internal"],
  ] as const)("status %s + audiens %s: ditolak dengan pesan itu, bahkan bila isinya lengkap", (status, audience) => {
    expect(publishBlocker({ ...full, status, audience }, 3)).toBe(MESSAGE);
  });

  it("entri kosong dan Internal: ditolak dengan pesan itu (bukan daftar yang kurang)", () => {
    const empty = { summary: "", canPromise: "", cannotPromise: "", status: "internal", audience: "internal" } as const;
    expect(publishBlocker(empty, 0)).toBe(MESSAGE);
  });

  it("entri yang akan terlihat tetapi belum lengkap: ditolak dengan daftar yang kurang", () => {
    expect(publishBlocker({ ...full, summary: "" }, 1)).toBe(publishBlockedMessage(["Ringkasan"]));
    expect(publishBlocker(full, 0)).toBe(publishBlockedMessage(["Cara pakai (minimal satu langkah)"]));
  });

  it("entri yang akan terlihat dan lengkap: boleh (null)", () => {
    expect(publishBlocker(full, 1)).toBeNull();
    expect(publishBlocker({ ...full, status: "siap", audience: "marketing" }, 2)).toBeNull();
  });
});
