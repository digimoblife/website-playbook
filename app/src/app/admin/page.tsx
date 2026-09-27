import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { listInbox } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { runDueSchedules } from "@/lib/schedule";
import { STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, KIND_LABEL, NATURE_LABEL, ROLE_LABEL } from "@/lib/labels";
import { archiveEntryAction, publishEntryAction } from "./entri/actions";
import { createEntryFromCommitAction, draftFromPullRequestAction, markChangeReviewedAction } from "./github/actions";
import { listNewGithubChanges, type GithubChangeRow } from "@/lib/github-changes";

export const metadata: Metadata = { title: "Inbox" };

const STATUS_MEANING = {
  internal: "Default untuk semua draf baru; belum boleh dibicarakan ke luar tim.",
  beta: "Sudah bisa dicoba tetapi terbatas; boleh disebut dengan hati-hati.",
  siap: "Sudah stabil dan boleh dipromosikan.",
} as const;

export default async function InboxPage() {
  const user = await requireAdmin();
  runDueSchedules();
  const rows = listInbox();
  const changes = listNewGithubChanges();
  const prs = changes.filter((c) => c.kind === "pr");
  const commits = changes.filter((c) => c.kind === "commit");

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

      {changes.length > 0 && (
        <section className="card" aria-labelledby="dari-github" style={{ marginBottom: "1.5rem" }}>
          <h2 id="dari-github">Dari GitHub</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Masuk lewat webhook. Tidak ada yang terbit otomatis: buat draf atau entri, lalu kurasi seperti biasa. Entri
            yang dibuat dari sini selalu Internal.
          </p>
          {prs.length > 0 && (
            <>
              <h3>PR yang di-merge ({prs.length})</h3>
              <ul className="entry-list">
                {prs.map((change) => (
                  <ChangeItem key={change.id} change={change} />
                ))}
              </ul>
            </>
          )}
          {commits.length > 0 && (
            <>
              <h3>Perlu ditinjau: commit langsung ke branch utama ({commits.length})</h3>
              <ul className="entry-list">
                {commits.map((change) => (
                  <ChangeItem key={change.id} change={change} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {rows.length === 0 ? (
        <div className="card empty-state">
          <p>Tidak ada entri draf yang menunggu keputusan.</p>
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
                {row.scheduledPublishAt && (
                  <p className="note">
                    <strong>Terjadwal terbit {formatDateTime(row.scheduledPublishAt)} WIB.</strong>
                  </p>
                )}
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

function ChangeItem({ change }: { change: GithubChangeRow }) {
  const label = change.kind === "pr" ? `PR #${change.prNumber}` : `Commit ${change.commitSha?.slice(0, 7)}`;
  return (
    <li className="entry-item">
      <h2>
        {change.url ? (
          <a href={change.url} target="_blank" rel="noopener noreferrer">
            {change.title}
          </a>
        ) : (
          change.title
        )}
      </h2>
      <div className="badges">
        <span className="badge badge-role">{label}</span>
        <span className="muted">{change.repo}</span>
        <span className="muted">{formatDateTime(change.happenedAt)}</span>
      </div>
      {change.files.length > 0 && (
        <p className="note" style={{ margin: 0 }}>
          {change.files.length} file berubah: {change.files.slice(0, 5).join(", ")}
          {change.files.length > 5 ? ", …" : ""}
        </p>
      )}
      <div className="item-actions">
        {change.kind === "pr" ? (
          <ActionForm action={draftFromPullRequestAction} id={change.id} label="Buat draf AI" variant="primary" />
        ) : (
          <ActionForm action={createEntryFromCommitAction} id={change.id} label="Buat entri" variant="primary" />
        )}
        <ActionForm action={markChangeReviewedAction} id={change.id} label="Tandai ditinjau" />
      </div>
    </li>
  );
}
