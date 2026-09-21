// Uji lapisan query terhadap database sungguhan (SQLite di memori, migrasi asli):
// data yang KEMBALI dari query harus sudah bersih, bukan sekadar disembunyikan di tampilan.
import { beforeAll, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/client";
import { entries } from "@/db/schema";
import { getEntryBySlugFor, listEntriesFor } from "@/lib/entries";
import type { Role } from "@/lib/domain";
import {
  ALL_ROLES,
  combos,
  comboSlug,
  makeTestDb,
  seedAllCombos,
  SECRET_MARKER,
} from "./helpers";

function expectedVisible(role: Role, c: ReturnType<typeof combos>[number]): boolean {
  if (role === "admin") return true;
  if (!c.isPublished || c.status === "internal") return false;
  if (role === "marketing") return c.audience === "marketing" || c.audience === "partner";
  return c.audience === "partner";
}

const queries: string[] = [];
let db: AppDb;

beforeAll(() => {
  db = makeTestDb({ logQuery: (q) => void queries.push(q) });
  seedAllCombos(db);
});

describe("listEntriesFor: entri yang kembali sesuai peran", () => {
  it.each(ALL_ROLES)("%s menerima persis entri yang boleh dilihatnya", (role) => {
    const expected = combos()
      .filter((c) => expectedVisible(role, c))
      .map(comboSlug)
      .sort();
    const got = listEntriesFor({ role }, db)
      .map((e) => e.slug)
      .sort();
    expect(got).toEqual(expected);
  });

  it("jumlahnya: Admin 18, Marketing 4, Partner 2", () => {
    expect(listEntriesFor({ role: "admin" }, db)).toHaveLength(18);
    expect(listEntriesFor({ role: "marketing" }, db)).toHaveLength(4);
    expect(listEntriesFor({ role: "partner" }, db)).toHaveLength(2);
  });

  it("pengguna tidak dikenal, nonaktif, atau berperan asing tidak menerima apa pun", () => {
    expect(listEntriesFor(null, db)).toEqual([]);
    expect(listEntriesFor(undefined, db)).toEqual([]);
    expect(listEntriesFor({ role: "admin", active: false }, db)).toEqual([]);
    expect(listEntriesFor({ role: "editor" as unknown as Role }, db)).toEqual([]);
  });
});

describe("getEntryBySlugFor: matriks 3 peran x 18 entri", () => {
  const cases = ALL_ROLES.flatMap((role) => combos().map((c) => ({ role, c })));

  it("mencakup 54 pasangan", () => expect(cases).toHaveLength(54));

  it.each(cases)("$role membuka $c.status/$c.audience/terbit=$c.isPublished", ({ role, c }) => {
    const got = getEntryBySlugFor({ role }, comboSlug(c), db);
    if (expectedVisible(role, c)) {
      expect(got?.slug).toBe(comboSlug(c));
    } else {
      expect(got).toBeNull();
    }
  });

  it("slug yang tidak ada mengembalikan null", () => {
    expect(getEntryBySlugFor({ role: "admin" }, "tidak-ada", db)).toBeNull();
  });
});

describe("cannot_promise ('Jangan dijanjikan')", () => {
  it("Partner tidak pernah menerima kunci maupun nilainya, di daftar maupun di detail", () => {
    const list = listEntriesFor({ role: "partner" }, db);
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) expect("cannotPromise" in e).toBe(false);
    expect(JSON.stringify(list)).not.toContain(SECRET_MARKER);
    expect(JSON.stringify(list)).not.toContain("cannotPromise");
    expect(JSON.stringify(list)).not.toContain("cannot_promise");

    for (const c of combos()) {
      const one = getEntryBySlugFor({ role: "partner" }, comboSlug(c), db);
      if (one) {
        expect("cannotPromise" in one).toBe(false);
        expect(JSON.stringify(one)).not.toContain(SECRET_MARKER);
      }
    }
  });

  it("kolom cannot_promise tidak pernah di-SELECT saat Partner yang membaca", () => {
    queries.length = 0;
    listEntriesFor({ role: "partner" }, db);
    getEntryBySlugFor({ role: "partner" }, "beta-partner-terbit", db);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const q of queries) expect(q).not.toContain("cannot_promise");
  });

  it("Admin dan Marketing menerima cannotPromise", () => {
    for (const role of ["admin", "marketing"] as const) {
      const one = getEntryBySlugFor({ role }, "siap-partner-terbit", db);
      expect(one?.cannotPromise).toBe(`${SECRET_MARKER}:siap-partner-terbit`);
      const list = listEntriesFor({ role }, db);
      expect(list.every((e) => typeof e.cannotPromise === "string")).toBe(true);
    }
  });

  it("SQL untuk Admin/Marketing memang memuat cannot_promise (pembuktian bahwa pemeriksaan di atas bermakna)", () => {
    queries.length = 0;
    listEntriesFor({ role: "marketing" }, db);
    expect(queries.some((q) => q.includes("cannot_promise"))).toBe(true);
  });
});

describe("default entri baru", () => {
  it("entri yang hanya diberi slug dan judul berstatus internal, beraudiens internal, belum terbit", () => {
    db.insert(entries).values({ slug: "entri-minimal", title: "Entri minimal" }).run();
    const admin = getEntryBySlugFor({ role: "admin" }, "entri-minimal", db);
    expect(admin).toMatchObject({
      status: "internal",
      audience: "internal",
      isPublished: false,
      kind: "core",
      nature: "new",
      publishedAt: null,
    });
    expect(getEntryBySlugFor({ role: "marketing" }, "entri-minimal", db)).toBeNull();
    expect(getEntryBySlugFor({ role: "partner" }, "entri-minimal", db)).toBeNull();
  });

  it("database menolak nilai status/audiens di luar daftar", () => {
    expect(() =>
      db
        .insert(entries)
        .values({ slug: "salah", title: "x", status: "rahasia" as never })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(entries)
        .values({ slug: "salah2", title: "x", audience: "publik" as never })
        .run(),
    ).toThrow();
  });
});
