import { describe, expect, it } from "vitest";
import { canSeeCannotPromise, canView, isAdmin, visibleAudiences } from "@/lib/access";
import type { Role } from "@/lib/domain";
import { ALL_AUDIENCES, ALL_ROLES, ALL_STATUSES, PUBLISHED_STATES } from "./helpers";

// Kebenaran yang diharapkan, ditulis terpisah dari implementasi (blueprint, aturan status).
function expectedVisible(
  role: Role,
  status: string,
  audience: string,
  isPublished: boolean,
): boolean {
  if (role === "admin") return true;
  if (!isPublished) return false;
  if (status === "internal") return false;
  if (role === "marketing") return audience === "marketing" || audience === "partner";
  return audience === "partner"; // partner
}

describe("canView: matriks 3 peran x 3 status x 3 audiens x terbit/draf", () => {
  const cases = ALL_ROLES.flatMap((role) =>
    ALL_STATUSES.flatMap((status) =>
      ALL_AUDIENCES.flatMap((audience) =>
        PUBLISHED_STATES.map((isPublished) => ({ role, status, audience, isPublished })),
      ),
    ),
  );

  it("mencakup 54 kombinasi", () => {
    expect(cases).toHaveLength(54);
  });

  it.each(cases)(
    "$role | status $status | audiens $audience | terbit=$isPublished",
    ({ role, status, audience, isPublished }) => {
      expect(canView({ role }, { status, audience, isPublished })).toBe(
        expectedVisible(role, status, audience, isPublished),
      );
    },
  );

  it("jumlah kombinasi yang terlihat per peran (angka tetap hasil hitung tangan)", () => {
    // Tiap peran punya 3 status x 3 audiens x 2 keadaan terbit = 18 kombinasi.
    const count = (role: Role) =>
      cases.filter((c) => c.role === role && canView({ role }, c)).length;
    expect(count("admin")).toBe(18); // semuanya
    expect(count("marketing")).toBe(4); // terbit(1) x status beta/siap(2) x audiens marketing/partner(2)
    expect(count("partner")).toBe(2); // terbit(1) x status beta/siap(2) x audiens partner(1)
  });
});

describe("kasus khusus akses", () => {
  const published = { isPublished: true, status: "siap" as const };

  it("pengguna tidak dikenal (null/undefined) tidak melihat apa pun", () => {
    const entry = { ...published, audience: "partner" as const };
    expect(canView(null, entry)).toBe(false);
    expect(canView(undefined, entry)).toBe(false);
  });

  it("akun nonaktif tidak melihat apa pun, termasuk Admin", () => {
    const entry = { ...published, audience: "partner" as const };
    for (const role of ALL_ROLES) {
      expect(canView({ role, active: false }, entry)).toBe(false);
      expect(canSeeCannotPromise({ role, active: false })).toBe(false);
    }
    expect(isAdmin({ role: "admin", active: false })).toBe(false);
  });

  it("peran tidak dikenal (mis. 'editor') ditolak", () => {
    const entry = { ...published, audience: "partner" as const };
    expect(canView({ role: "editor" as unknown as Role }, entry)).toBe(false);
    expect(visibleAudiences("editor")).toEqual([]);
  });

  it("Marketing melihat audiens marketing dan partner; Partner hanya partner", () => {
    expect(visibleAudiences("marketing")).toEqual(["marketing", "partner"]);
    expect(visibleAudiences("partner")).toEqual(["partner"]);
    expect(visibleAudiences("admin")).toEqual(["internal", "marketing", "partner"]);
  });

  it("status internal tidak pernah terlihat oleh Marketing/Partner walau terbit dan beraudiens partner", () => {
    const entry = { isPublished: true, status: "internal" as const, audience: "partner" as const };
    expect(canView({ role: "marketing" }, entry)).toBe(false);
    expect(canView({ role: "partner" }, entry)).toBe(false);
    expect(canView({ role: "admin" }, entry)).toBe(true);
  });

  it("entri draf tidak terlihat oleh pembaca walau status dan audiens sesuai", () => {
    const entry = { isPublished: false, status: "siap" as const, audience: "partner" as const };
    expect(canView({ role: "marketing" }, entry)).toBe(false);
    expect(canView({ role: "partner" }, entry)).toBe(false);
  });

  it("'Jangan dijanjikan' hanya untuk Admin dan Marketing", () => {
    expect(canSeeCannotPromise({ role: "admin" })).toBe(true);
    expect(canSeeCannotPromise({ role: "marketing" })).toBe(true);
    expect(canSeeCannotPromise({ role: "partner" })).toBe(false);
    expect(canSeeCannotPromise(null)).toBe(false);
  });
});
