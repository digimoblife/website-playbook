import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { NewEntryForm } from "./new-entry-form";

export const metadata: Metadata = { title: "Entri baru" };

export default async function EntriBaruPage() {
  await requireAdmin();
  return (
    <>
      <div className="page-head">
        <h1>Entri baru</h1>
        <p className="muted" style={{ margin: 0 }}>
          Entri baru selalu berstatus Internal, beraudiens Internal saja, dan belum terbit. Isi lengkapnya di editor.
        </p>
      </div>
      <section className="card card-narrow" aria-labelledby="judul-baru">
        <h2 id="judul-baru">Judul entri</h2>
        <NewEntryForm />
        <p style={{ margin: "1rem 0 0" }}>
          <Link href="/admin/entri" className="link-block">Kembali ke Semua entri</Link>
        </p>
      </section>
    </>
  );
}
