import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { listArchive } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";
import { restoreEntryAction } from "../entri/actions";

export const metadata: Metadata = { title: "Arsip" };

export default async function ArsipPage() {
  await requireAdmin();
  const rows = listArchive();

  return (
    <>
      <div className="page-head">
        <h1>Arsip</h1>
        <p className="muted" style={{ margin: 0 }}>
          Entri yang diarsipkan tidak tampil ke pembaca dan tidak dihapus. Pulihkan untuk mengembalikannya ke Inbox
          sebagai draf.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">
          <p style={{ margin: 0 }}>Arsip kosong.</p>
        </div>
      ) : (
        <section className="card" aria-labelledby="daftar-arsip">
          <h2 id="daftar-arsip">{rows.length} entri diarsipkan</h2>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col">Judul</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Status</th>
                  <th scope="col">Diarsipkan</th>
                  <th scope="col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/entri/${row.id}`}>
                        <strong>{row.title}</strong>
                      </Link>
                    </td>
                    <td>{KIND_LABEL[row.kind]}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{formatDateTime(row.archivedAt)}</td>
                    <td>
                      <ActionForm action={restoreEntryAction} id={row.id} label="Pulihkan" variant="primary" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
