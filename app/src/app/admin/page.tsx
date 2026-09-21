import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { listInbox } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, KIND_LABEL, NATURE_LABEL, ROLE_LABEL } from "@/lib/labels";
import { archiveEntryAction, publishEntryAction } from "./entri/actions";

export const metadata: Metadata = { title: "Inbox" };

const STATUS_MEANING = {
  internal: "Default untuk semua draf baru; belum boleh dibicarakan ke luar tim.",
  beta: "Sudah bisa dicoba tetapi terbatas; boleh disebut dengan hati-hati.",
  siap: "Sudah stabil dan boleh dipromosikan.",
} as const;

export default async function InboxPage() {
  const user = await requireAdmin();
  const rows = listInbox();

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <h1>Inbox</h1>
          <p className="muted" style={{ margin: 0 }}>
            Halo, {user.name}. <span className="badge badge-role">{ROLE_LABEL[user.role]}</span>{" "}
            Entri yang belum terlihat oleh pembaca dan belum diarsipkan, terbaru di atas.
          </p>
        </div>
        <Link href="/admin/entri/baru" className="btn btn-primary">
          Entri baru
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">
          <p>Inbox kosong. Tidak ada entri yang menunggu keputusan.</p>
          <Link href="/admin/entri/baru" className="btn btn-primary">
            Buat entri baru
          </Link>
        </div>
      ) : (
        <>
          <p className="muted">{rows.length} entri menunggu.</p>
          <ul className="entry-list">
            {rows.map((row) => (
              <li key={row.id} className="entry-item">
                <h2>
                  <Link href={`/admin/entri/${row.id}`}>{row.title}</Link>
                </h2>
                <div className="badges">
                  <StatusBadge status={row.status} />
                  <span className="badge badge-role">{KIND_LABEL[row.kind]}</span>
                  <span className="badge badge-internal">{NATURE_LABEL[row.nature]}</span>
                  <span className="muted">Audiens: {AUDIENCE_LABEL[row.audience]}</span>
                  <span className="muted">Diperbarui {formatDateTime(row.updatedAt)}</span>
                </div>
                {row.isPublished ? (
                  <p className="note">
                    Sudah terbit, tetapi belum terlihat oleh pembaca karena status atau audiens masih Internal.
                    Ubah di editor.
                  </p>
                ) : !row.willBeVisible ? (
                  <p className="note">
                    Belum bisa dipublish: status atau audiens masih Internal. Ubah di editor agar bisa tampil ke
                    pembaca.
                  </p>
                ) : !row.canPublishNow ? (
                  <p className="note">Belum bisa dipublish. Lengkapi dulu: {row.missing.join(", ")}.</p>
                ) : null}
                <div className="item-actions">
                  <Link href={`/admin/entri/${row.id}`} className="btn btn-secondary">
                    Buka editor
                  </Link>
                  <ActionForm
                    action={archiveEntryAction}
                    id={row.id}
                    label="Ke arsip"
                    variant="danger"
                    confirmText="Arsipkan entri ini?"
                  />
                  {row.canPublishNow && (
                    <ActionForm action={publishEntryAction} id={row.id} label="Publish" variant="primary" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="card" aria-labelledby="status-konten" style={{ marginTop: "2rem" }}>
        <h2 id="status-konten">Status konten</h2>
        <ul className="legend">
          {STATUSES.map((status) => (
            <li key={status}>
              <StatusBadge status={status} />
              <span>{STATUS_MEANING[status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
