// "Lihat sebagai": pemetaan Admin ke viewer sintetis, dan bukti bahwa cookie pratinjau_peran
// tidak pernah berarti apa pun untuk Marketing/Partner sungguhan.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth";

const state = vi.hoisted(() => ({ cookieValue: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "pratinjau_peran" && state.cookieValue !== undefined
        ? { value: state.cookieValue }
        : undefined,
  }),
}));

import { DEFAULT_PREVIEW_ROLE, getPreviewRole, getWebsiteViewer, PREVIEW_COOKIE } from "@/lib/preview";

function user(over: Partial<SessionUser>): SessionUser {
  return {
    id: 1,
    name: "Pengguna Uji",
    email: "uji@contoh.id",
    role: "admin",
    partnerName: null,
    mustChangePassword: false,
    active: true,
    ...over,
  };
}

beforeEach(() => {
  state.cookieValue = undefined;
});

describe("PREVIEW_COOKIE", () => {
  it("nama cookie sesuai spesifikasi", () => {
    expect(PREVIEW_COOKIE).toBe("pratinjau_peran");
  });
});

describe("getPreviewRole", () => {
  it("default 'marketing' bila cookie belum pernah diset", async () => {
    expect(await getPreviewRole()).toBe("marketing");
    expect(DEFAULT_PREVIEW_ROLE).toBe("marketing");
  });

  it("memakai nilai cookie yang valid", async () => {
    state.cookieValue = "partner";
    expect(await getPreviewRole()).toBe("partner");
    state.cookieValue = "marketing";
    expect(await getPreviewRole()).toBe("marketing");
  });

  it("nilai cookie yang tidak dikenal (mis. dirusak) jatuh ke default", async () => {
    for (const bad of ["admin", "superadmin", "", "PARTNER", "marketing ", "null"]) {
      state.cookieValue = bad;
      expect(await getPreviewRole(), JSON.stringify(bad)).toBe("marketing");
    }
  });
});

describe("getWebsiteViewer", () => {
  it("Admin dipetakan ke viewer sintetis sesuai cookie, bukan viewer Admin asli", async () => {
    state.cookieValue = "partner";
    const viewer = await getWebsiteViewer(user({ role: "admin" }));
    expect(viewer).toEqual({ role: "partner", active: true });
  });

  it("Admin yang belum pernah memilih memakai default 'marketing'", async () => {
    state.cookieValue = undefined;
    const viewer = await getWebsiteViewer(user({ role: "admin" }));
    expect(viewer).toEqual({ role: "marketing", active: true });
  });

  it("Admin dengan cookie rusak tetap mendapat viewer sintetis default, bukan viewer Admin", async () => {
    state.cookieValue = "bukan-peran-valid";
    const viewer = await getWebsiteViewer(user({ role: "admin" }));
    expect(viewer).toEqual({ role: "marketing", active: true });
  });

  it("Marketing sungguhan: cookie diabaikan TOTAL, apa pun isinya", async () => {
    for (const cookie of ["partner", "marketing", "admin", undefined, "sampah"]) {
      state.cookieValue = cookie;
      const viewer = await getWebsiteViewer(user({ id: 2, role: "marketing" }));
      expect(viewer, JSON.stringify(cookie)).toEqual({ role: "marketing", active: true });
    }
  });

  it("Partner sungguhan: cookie diabaikan TOTAL, apa pun isinya (termasuk 'marketing')", async () => {
    for (const cookie of ["marketing", "partner", "admin", undefined, "sampah"]) {
      state.cookieValue = cookie;
      const viewer = await getWebsiteViewer(user({ id: 3, role: "partner", partnerName: "PT Mitra" }));
      expect(viewer, JSON.stringify(cookie)).toEqual({ role: "partner", active: true });
    }
  });

  it("status aktif akun Marketing/Partner diteruskan apa adanya (bukan dipaksa true)", async () => {
    const viewer = await getWebsiteViewer(user({ id: 4, role: "marketing", active: false }));
    expect(viewer).toEqual({ role: "marketing", active: false });
  });
});
