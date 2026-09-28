import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { NewGuideForm } from "./new-guide-form";

export const metadata: Metadata = { title: "Panduan baru" };

export default async function PanduanBaruPage() {
  await requireAdmin();
  return (
    <>
      <div className="page-head">
        <h1>Panduan baru</h1>
        <p className="muted" style={{ margin: 0 }}>
          Panduan baru selalu berstatus Internal, beraudiens Internal saja, dan belum terbit. Isi langkahnya di editor.
        </p>
      </div>
      <section className="card card-narrow" aria-labelledby="judul-panduan-baru">
        <h2 id="judul-panduan-baru">Judul panduan</h2>
        <NewGuideForm />
        <p style={{ margin: "1rem 0 0" }}>
          <Link href="/admin/panduan" className="link-block">Kembali ke Panduan skenario</Link>
        </p>
      </section>
    </>
  );
}
