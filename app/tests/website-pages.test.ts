// Halaman website benar-benar DIRENDER ke HTML (bukan hanya data yang diperiksa), supaya
// kebocoran seperti "Jangan dijanjikan" muncul di markup untuk Partner benar-benar tertangkap
// walau suatu saat ada yang lupa memeriksa "cannotPromise" in entry di JSX.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppDb } from "@/db/client";
import { entries, media } from "@/db/schema";
import { createEntry, publishEntry, saveEntry } from "@/lib/admin-entries";
import type { SessionUser } from "@/lib/auth";
import { createGuide, publishGuide, saveGuide } from "@/lib/guides";
import { insertUserRow, makeTestDb, validGuideInput, validInput } from "./helpers";

const state = vi.hoisted(() => ({
  user: undefined as SessionUser | undefined,
  previewCookie: undefined as string | undefined,
  db: undefined as unknown,
}));

function fakeRedirect(path: string): never {
  const error = new Error(`NEXT_REDIRECT`) as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${path};307;`;
  throw error;
}

vi.mock("@/lib/dal", () => ({
  getCurrentUser: async () => state.user ?? null,
  requireUser: async () => state.user ?? fakeRedirect("/masuk"),
  requireAdmin: async () => {
    if (!state.user) fakeRedirect("/masuk");
    if (state.user.role !== "admin") fakeRedirect("/");
    return state.user;
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "pratinjau_peran" && state.previewCookie ? { value: state.previewCookie } : undefined,
  }),
}));
vi.mock("@/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/client")>()),
  getDb: () => state.db,
}));

import EntriPage from "@/app/(situs)/entri/[slug]/page";
import BerandaPage from "@/app/(situs)/page";
import ApaYangBaruPage from "@/app/(situs)/baru/page";
import KatalogPage from "@/app/(situs)/katalog/page";
import PanduanPage from "@/app/(situs)/panduan/page";
import PanduanDetailPage from "@/app/(situs)/panduan/[slug]/page";

function sessionUser(over: Partial<SessionUser>): SessionUser {
  return {
    id: 1,
    name: "Pengguna Uji",
    email: "uji@contoh.id",
    role: "marketing",
    partnerName: null,
    mustChangePassword: false,
    active: true,
    ...over,
  };
}

const CANNOT_MARKER = "RAHASIA-JANGAN-DIJANJIKAN-KE-PARTNER";
const CAN_MARKER = "BOLEH-DIJANJIKAN-TAMPIL";

let db: AppDb;
let adminId: number;
let marketing: SessionUser;
let partner: SessionUser;
let admin: SessionUser;
let slug: string;

beforeEach(() => {
  db = makeTestDb();
  state.db = db;
  state.previewCookie = undefined;

  const adminRow = insertUserRow(db, { email: "admin@uji.lokal", role: "admin" });
  adminId = adminRow.id;
  admin = sessionUser({ id: adminRow.id, role: "admin", name: "Admin Uji" });
  const marketingRow = insertUserRow(db, { email: "marketing@uji.lokal", role: "marketing" });
  marketing = sessionUser({ id: marketingRow.id, role: "marketing", name: "Marketing Uji" });
  const partnerRow = insertUserRow(db, { email: "partner@uji.lokal", role: "partner", partnerName: "PT Mitra" });
  partner = sessionUser({ id: partnerRow.id, role: "partner", name: "Partner Uji", partnerName: "PT Mitra" });

  slug = "fitur-uji";
  const created = createEntry({ title: "Fitur Uji", actorId: adminId }, db);
  if (!created.ok) throw new Error(created.error);
  saveEntry(
    created.id,
    validInput({
      title: "Fitur Uji",
      slug,
      status: "siap",
      audience: "partner",
      canPromise: CAN_MARKER,
      cannotPromise: CANNOT_MARKER,
    }),
    adminId,
    db,
  );
  const published = publishEntry(created.id, adminId, db);
  if (!published.ok) throw new Error(published.error);
});

async function renderEntri(slugToRender = slug) {
  return renderToStaticMarkup(await EntriPage({ params: Promise.resolve({ slug: slugToRender }) }));
}

function isNotFoundDigest(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

describe("Halaman fitur: 'Jangan dijanjikan' tidak pernah dirender untuk Partner", () => {
  it("Partner sungguhan: markup TIDAK memuat isinya maupun judul bagiannya", async () => {
    state.user = partner;
    const html = await renderEntri();
    expect(html).not.toContain(CANNOT_MARKER);
    expect(html).not.toContain("Jangan dijanjikan");
    // Untuk memastikan tes ini bukan salah-negatif: bagian lain memang ada di halaman.
    expect(html).toContain(CAN_MARKER);
    expect(html).toContain("Boleh dijanjikan");
  });

  it("Marketing sungguhan: markup MEMUAT isinya", async () => {
    state.user = marketing;
    const html = await renderEntri();
    expect(html).toContain(CANNOT_MARKER);
    expect(html).toContain("Jangan dijanjikan");
  });

  it("entri tanpa isi 'Jangan dijanjikan' sama sekali: judul bagian juga tidak muncul untuk Marketing", async () => {
    const created = createEntry({ title: "Tanpa Larangan", actorId: adminId }, db);
    if (!created.ok) throw new Error();
    saveEntry(
      created.id,
      validInput({ title: "Tanpa Larangan", slug: "tanpa-larangan", status: "siap", audience: "partner", cannotPromise: "" }),
      adminId,
      db,
    );
    // cannotPromise kosong sebenarnya tidak lolos aturan publish (Admin wajib mengisinya untuk
    // entri yang terlihat pembaca); status terbit diset langsung agar lapisan TAMPILAN teruji
    // sendiri, seandainya ada baris lama dari sebelum aturan itu ada.
    db.update(entries).set({ isPublished: true, publishedAt: new Date() }).where(eq(entries.id, created.id)).run();

    state.user = marketing;
    const html = await renderEntri("tanpa-larangan");
    expect(html).not.toContain("Jangan dijanjikan");
  });

  it("Admin BERPRATINJAU sebagai Partner: 'Jangan dijanjikan' tersembunyi", async () => {
    state.user = admin;
    state.previewCookie = "partner";
    const html = await renderEntri();
    expect(html).not.toContain(CANNOT_MARKER);
    expect(html).not.toContain("Jangan dijanjikan");
  });

  it("Admin BERPRATINJAU sebagai Marketing: 'Jangan dijanjikan' tampil", async () => {
    state.user = admin;
    state.previewCookie = "marketing";
    const html = await renderEntri();
    expect(html).toContain(CANNOT_MARKER);
    expect(html).toContain("Jangan dijanjikan");
  });

  it("Admin TANPA memilih pratinjau: default 'marketing', jadi 'Jangan dijanjikan' tampil", async () => {
    state.user = admin;
    state.previewCookie = undefined;
    const html = await renderEntri();
    expect(html).toContain(CANNOT_MARKER);
  });
});

describe("Halaman fitur: 404 tidak membedakan 'tidak ada' vs 'tidak boleh dilihat'", () => {
  it("slug yang tidak ada -> notFound()", async () => {
    state.user = partner;
    await expect(renderEntri("tidak-ada-slug")).rejects.toSatisfy(isNotFoundDigest);
  });

  it("entri yang ada tetapi tidak boleh dilihat Partner -> notFound() juga", async () => {
    const created = createEntry({ title: "Khusus Marketing", actorId: adminId }, db);
    if (!created.ok) throw new Error();
    saveEntry(
      created.id,
      validInput({ title: "Khusus Marketing", slug: "khusus-marketing", status: "beta", audience: "marketing" }),
      adminId,
      db,
    );
    publishEntry(created.id, adminId, db);

    state.user = partner;
    await expect(renderEntri("khusus-marketing")).rejects.toSatisfy(isNotFoundDigest);
  });
});

describe("Halaman fitur: umpan balik hanya untuk pembaca sungguhan", () => {
  it("Marketing/Partner sungguhan melihat 'Apakah halaman ini membantu?'", async () => {
    for (const user of [marketing, partner]) {
      state.user = user;
      const html = await renderEntri();
      expect(html, user.role).toContain("Apakah halaman ini membantu?");
    }
  });

  it("Admin (asli maupun berpratinjau) TIDAK melihat kontrol umpan balik", async () => {
    state.user = admin;
    for (const preview of [undefined, "marketing", "partner"] as const) {
      state.previewCookie = preview;
      const html = await renderEntri();
      expect(html, String(preview)).not.toContain("Apakah halaman ini membantu?");
    }
  });
});

describe("Katalog dan Apa yang baru: tidak pernah menampilkan entri Internal atau yang tak terlihat", () => {
  beforeEach(() => {
    const internalEntry = createEntry({ title: "Cuma Internal", actorId: adminId }, db);
    if (!internalEntry.ok) throw new Error();
    saveEntry(
      internalEntry.id,
      validInput({ title: "Cuma Internal", slug: "cuma-internal", status: "internal", audience: "internal" }),
      adminId,
      db,
    );
    // Sengaja TIDAK dipublish (dan memang tidak akan lolos aturan publish untuk kombinasi ini).

    const marketingOnly = createEntry({ title: "Cuma Marketing", actorId: adminId }, db);
    if (!marketingOnly.ok) throw new Error();
    saveEntry(
      marketingOnly.id,
      validInput({ title: "Cuma Marketing", slug: "cuma-marketing", status: "beta", audience: "marketing" }),
      adminId,
      db,
    );
    const pub = publishEntry(marketingOnly.id, adminId, db);
    if (!pub.ok) throw new Error(pub.error);
  });

  it("Katalog untuk Partner sungguhan: tidak memuat entri Internal atau entri khusus Marketing", async () => {
    state.user = partner;
    const html = renderToStaticMarkup(await KatalogPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("Cuma Internal");
    expect(html).not.toContain("Cuma Marketing");
    expect(html).toContain("Fitur Uji"); // kontrol: entri yang memang terlihat tetap muncul
  });

  it("Apa yang baru untuk Partner sungguhan: tidak memuat entri Internal atau entri khusus Marketing", async () => {
    state.user = partner;
    const html = renderToStaticMarkup(await ApaYangBaruPage());
    expect(html).not.toContain("Cuma Internal");
    expect(html).not.toContain("Cuma Marketing");
    expect(html).toContain("Fitur Uji");
  });

  it("Beranda ('Baru minggu ini') untuk Partner sungguhan: tidak memuat entri Internal atau khusus Marketing", async () => {
    state.user = partner;
    const html = renderToStaticMarkup(await BerandaPage());
    expect(html).not.toContain("Cuma Internal");
    expect(html).not.toContain("Cuma Marketing");
  });

  it("Katalog untuk Admin BERPRATINJAU sebagai Partner: sama seperti Partner sungguhan", async () => {
    state.user = admin;
    state.previewCookie = "partner";
    const html = renderToStaticMarkup(await KatalogPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("Cuma Internal");
    expect(html).not.toContain("Cuma Marketing");
  });

  it("Katalog untuk Admin BERPRATINJAU sebagai Marketing: entri khusus Marketing muncul, Internal tetap tidak", async () => {
    state.user = admin;
    state.previewCookie = "marketing";
    const html = renderToStaticMarkup(await KatalogPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("Cuma Internal");
    expect(html).toContain("Cuma Marketing");
  });

  it("Katalog untuk Marketing sungguhan: entri khusus Marketing muncul", async () => {
    state.user = marketing;
    const html = renderToStaticMarkup(await KatalogPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain("Cuma Internal");
    expect(html).toContain("Cuma Marketing");
  });

  it("filter chip tag: hanya menampilkan entri yang punya tag itu, tetap dalam batas visibilitas", async () => {
    const created = createEntry({ title: "Dengan Tag Stok", actorId: adminId }, db);
    if (!created.ok) throw new Error();
    saveEntry(
      created.id,
      validInput({
        title: "Dengan Tag Stok",
        slug: "dengan-tag-stok",
        status: "siap",
        audience: "partner",
        needsTags: ["mengelola-stok"],
      }),
      adminId,
      db,
    );
    publishEntry(created.id, adminId, db);

    state.user = partner;
    const filtered = renderToStaticMarkup(
      await KatalogPage({ searchParams: Promise.resolve({ tag: "mengelola-stok" }) }),
    );
    expect(filtered).toContain("Dengan Tag Stok");
    expect(filtered).not.toContain("Fitur Uji"); // tidak bertag "mengelola-stok"

    const unfiltered = renderToStaticMarkup(await KatalogPage({ searchParams: Promise.resolve({}) }));
    expect(unfiltered).toContain("Dengan Tag Stok");
    expect(unfiltered).toContain("Fitur Uji");
  });
});

describe("Halaman fitur: bagian 'Pertanyaan yang sering diajukan'", () => {
  it("FAQ kosong: bagian tidak dirender sama sekali", async () => {
    state.user = marketing;
    const html = await renderEntri();
    expect(html).not.toContain("Pertanyaan yang sering diajukan");
  });

  it("FAQ terisi: pertanyaan dan jawabannya dirender, untuk Marketing maupun Partner", async () => {
    const created = createEntry({ title: "Dengan FAQ", actorId: adminId }, db);
    if (!created.ok) throw new Error();
    saveEntry(
      created.id,
      validInput({
        title: "Dengan FAQ",
        slug: "dengan-faq",
        status: "siap",
        audience: "partner",
        faqs: [{ question: "Apakah gratis?", answer: "Ya, gratis." }],
      }),
      adminId,
      db,
    );
    publishEntry(created.id, adminId, db);

    for (const user of [marketing, partner]) {
      state.user = user;
      const html = await renderEntri("dengan-faq");
      expect(html, user.role).toContain("Pertanyaan yang sering diajukan");
      expect(html, user.role).toContain("Apakah gratis?");
      expect(html, user.role).toContain("Ya, gratis.");
    }
  });
});

describe("Halaman fitur: tombol 'Coba di toko demo'", () => {
  const ORIGINAL = process.env.DEMO_STORE_URL;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.DEMO_STORE_URL;
    else process.env.DEMO_STORE_URL = ORIGINAL;
  });

  it("DEMO_STORE_URL tidak diset: tombol tidak ada di markup", async () => {
    delete process.env.DEMO_STORE_URL;
    state.user = marketing;
    const html = await renderEntri();
    expect(html).not.toContain("Coba di toko demo");
  });

  it("DEMO_STORE_URL tidak valid: tombol tidak ada di markup", async () => {
    process.env.DEMO_STORE_URL = "bukan-url";
    state.user = marketing;
    const html = await renderEntri();
    expect(html).not.toContain("Coba di toko demo");
  });

  it("DEMO_STORE_URL valid: tombol ada dan mengarah ke URL yang benar", async () => {
    process.env.DEMO_STORE_URL = "https://demo.lapaq.id/toko";
    state.user = marketing;
    const html = await renderEntri();
    expect(html).toContain("Coba di toko demo");
    expect(html).toContain('href="https://demo.lapaq.id/toko"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("Panduan skenario: tautan fitur tidak membocorkan entri yang tak terlihat", () => {
  beforeEach(() => {
    const hidden = createEntry({ title: "Fitur Rahasia Marketing", actorId: adminId }, db);
    if (!hidden.ok) throw new Error();
    saveEntry(
      hidden.id,
      validInput({ title: "Fitur Rahasia Marketing", slug: "fitur-rahasia-marketing", status: "beta", audience: "marketing" }),
      adminId,
      db,
    );
    publishEntry(hidden.id, adminId, db);
    const visible = db.select({ id: entries.id }).from(entries).where(eq(entries.slug, slug)).get()!;

    const guide = createGuide({ title: "Demo Sepuluh Menit", actorId: adminId }, db);
    if (!guide.ok) throw new Error(guide.error);
    const saved = saveGuide(
      guide.id,
      validGuideInput({
        title: "Demo Sepuluh Menit",
        slug: "demo-sepuluh-menit",
        steps: [
          { text: "Tunjukkan fitur umum", entryId: visible.id },
          { text: "Tunjukkan fitur khusus", entryId: hidden.id },
        ],
      }),
      adminId,
      db,
    );
    if (!saved.ok) throw new Error(saved.error);
    const pub = publishGuide(guide.id, adminId, db);
    if (!pub.ok) throw new Error(pub.error);
  });

  const renderGuide = async (guideSlug = "demo-sepuluh-menit") =>
    renderToStaticMarkup(await PanduanDetailPage({ params: Promise.resolve({ slug: guideSlug }) }));

  it("Partner sungguhan: teks semua langkah tampil, tapi tautan dan judul fitur khusus Marketing tidak", async () => {
    state.user = partner;
    const html = await renderGuide();
    expect(html).toContain("Tunjukkan fitur umum");
    expect(html).toContain("Tunjukkan fitur khusus");
    expect(html).toContain(`href="/entri/${slug}"`);
    expect(html).not.toContain("Fitur Rahasia Marketing");
    expect(html).not.toContain("fitur-rahasia-marketing");
  });

  it("Marketing sungguhan dan Admin berpratinjau Marketing: kedua tautan tampil", async () => {
    for (const [user, preview] of [
      [marketing, undefined],
      [admin, "marketing"],
    ] as const) {
      state.user = user;
      state.previewCookie = preview;
      const html = await renderGuide();
      expect(html).toContain('href="/entri/fitur-rahasia-marketing"');
    }
  });

  it("daftar panduan tampil untuk Partner; panduan yang tak ada -> notFound()", async () => {
    state.user = partner;
    const list = renderToStaticMarkup(await PanduanPage());
    expect(list).toContain("Demo Sepuluh Menit");
    await expect(renderGuide("tidak-ada")).rejects.toSatisfy(isNotFoundDigest);
  });

  it("panduan khusus Marketing -> notFound() untuk Partner dan tidak ada di daftarnya", async () => {
    const guide = createGuide({ title: "Panduan Internal Marketing", actorId: adminId }, db);
    if (!guide.ok) throw new Error();
    saveGuide(guide.id, validGuideInput({ title: "Panduan Internal Marketing", slug: "panduan-marketing", audience: "marketing" }), adminId, db);
    publishGuide(guide.id, adminId, db);
    state.user = partner;
    await expect(renderGuide("panduan-marketing")).rejects.toSatisfy(isNotFoundDigest);
    expect(renderToStaticMarkup(await PanduanPage())).not.toContain("Panduan Internal Marketing");
  });
});

describe("Halaman fitur: gambar promosi di 'Materi siap pakai'", () => {
  it("gambar promosi punya tombol unduh dan tidak ikut galeri 'Cara kerja'", async () => {
    const row = db.select({ id: entries.id }).from(entries).where(eq(entries.slug, slug)).get()!;
    const promo = db
      .insert(media)
      .values({ entryId: row.id, kind: "promo", source: "manual", filePath: "0123456789abcdef0123456789abcdef.png" })
      .returning()
      .get();
    state.user = partner;
    const html = await renderEntri();
    expect(html).toContain("Materi siap pakai");
    expect(html).toContain(`href="/media/${promo.id}?unduh=1"`);
    expect(html).toContain("Unduh gambar promosi 1");
    expect(html).not.toContain("Cara kerja");
  });
});

describe("Jadwal publish dijalankan saat pembaca membuka halaman", () => {
  it("entri yang jadwalnya sudah lewat langsung tampil di Apa yang baru", async () => {
    const created = createEntry({ title: "Fitur Terjadwal", actorId: adminId }, db);
    if (!created.ok) throw new Error();
    saveEntry(created.id, validInput({ title: "Fitur Terjadwal", slug: "fitur-terjadwal" }), adminId, db);
    // Jadwal yang sudah lewat, dipasang langsung ke database (scheduleEntryPublish menolak waktu lampau).
    db.update(entries)
      .set({ scheduledPublishAt: new Date(Date.now() - 60_000), scheduledBy: adminId })
      .where(eq(entries.id, created.id))
      .run();
    state.user = partner;
    const html = renderToStaticMarkup(await ApaYangBaruPage());
    expect(html).toContain("Fitur Terjadwal");
  });
});
