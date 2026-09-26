import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { listGuidesAdmin } from "@/lib/guides";
import { AUDIENCE_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Panduan skenario" };

export default async function PanduanAdminPage() {
  await requireAdmin();
  const rows = listGuidesAdmin();

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <h1>Panduan skenario</h1>
          <p className="muted" style={{ margin: 0 }}>
            Alur langkah demi langkah yang merangkai beberapa fitur, mis. &ldquo;Menunjukkan Lapaq ke calon
            pelanggan dalam 10 menit&rdquo;. Aturan status, audiens, dan publish sama seperti entri.
          </p>
        </div>
        <Link href="/admin/panduan/baru" className="btn btn-primary">
          Panduan baru
        </Link>
      </div>

      <section className="card" aria-labelledby="daftar-panduan">
        <h2 id="daftar-panduan">{rows.length} panduan</h2>
        {rows.length === 0 ? (
          <p className="muted">Belum ada panduan skenario.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th scope="col">Judul</th>
                  <th scope="col">Langkah</th>
                  <th scope="col">Status</th>
                  <th scope="col">Audiens</th>
                  <th scope="col">Terbit</th>
                  <th scope="col">Diperbarui</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/panduan/${row.id}`}>
                        <strong>{row.title}</strong>
                      </Link>
                    </td>
                    <td>{row.stepCount}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{AUDIENCE_LABEL[row.audience]}</td>
                    <td>
                      {row.archivedAt ? (
                        <span className="badge badge-internal">Diarsipkan</span>
                      ) : (
                        <span className={`badge ${row.isPublished ? "badge-siap" : "badge-internal"}`}>
                          {row.isPublished ? "Ya" : "Belum"}
                        </span>
                      )}
                    </td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
