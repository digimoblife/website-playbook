import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/dal";
import { listGuidesFor } from "@/lib/guides";
import { getWebsiteViewer } from "@/lib/preview";

export const metadata: Metadata = { title: "Panduan skenario" };

export default async function PanduanPage() {
  const user = await requireUser();
  const viewer = await getWebsiteViewer(user);
  const rows = listGuidesFor(viewer);

  return (
    <>
      <div className="page-head">
        <h1>Panduan skenario</h1>
        <p className="muted" style={{ margin: 0 }}>
          Urutan langkah untuk situasi nyata, mis. saat menunjukkan produk ke calon pelanggan.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">
          <p style={{ margin: 0 }}>Belum ada panduan skenario untuk Anda.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {rows.map((guide) => (
            <Link key={guide.id} href={`/panduan/${guide.slug}`} className="card catalog-card">
              <h2>{guide.title}</h2>
              <div className="badges">
                <StatusBadge status={guide.status} />
              </div>
              {guide.summary && (
                <p className="muted" style={{ margin: 0 }}>
                  {guide.summary}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
