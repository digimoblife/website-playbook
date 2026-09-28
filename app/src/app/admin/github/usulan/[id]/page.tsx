import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { requireAdmin } from "@/lib/dal";
import { getGithubChange, listProposals } from "@/lib/github-changes";
import { KIND_LABEL, NATURE_LABEL } from "@/lib/labels";
import { createEntryFromProposalAction, finishProposalsAction } from "../../actions";

export const metadata: Metadata = { title: "Usulan entri dari AI" };

export default async function UsulanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  const change = getGithubChange(Number(id));
  if (!change || change.kind !== "pr") notFound();
  const proposals = listProposals(change.id);
  const created = proposals.filter((p) => p.entryId).length;

  return (
    <>
      <div className="page-head">
        <h1>Usulan entri dari AI</h1>
        <p className="muted" style={{ margin: 0 }}>
          AI membaca judul, deskripsi, dan nama file{" "}
          <a href={change.url} target="_blank" rel="noopener noreferrer">
            PR #{change.prNumber}: {change.title}
          </a>{" "}
          dan menemukan {proposals.length} fitur atau pembaruan. Pilih yang perlu entri Playbook. Entri yang dibuat
          selalu Internal dan belum terbit; Jenis dan Sifat dari AI hanya usulan.
        </p>
      </div>

      {proposals.length === 0 ? (
        <div className="card empty-state">
          <p style={{ margin: 0 }}>Belum ada usulan untuk PR ini. Buat dari Inbox dengan tombol Buat draf AI.</p>
        </div>
      ) : (
        <ul className="entry-list">
          {proposals.map((p) => (
            <li key={p.id} className="entry-item">
              <h2>
                {p.position}. {p.title}
              </h2>
              <div className="badges">
                <span className="badge badge-beta">Usulan AI: {KIND_LABEL[p.kind]}</span>
                <span className="badge badge-internal">{NATURE_LABEL[p.nature]}</span>
              </div>
              {p.summary && <p style={{ margin: 0 }}>{p.summary}</p>}
              {p.explanation && (
                <p className="note" style={{ margin: 0, whiteSpace: "pre-line" }}>
                  {p.explanation}
                </p>
              )}
              <div className="item-actions">
                {p.entryId ? (
                  <Link href={`/admin/entri/${p.entryId}`} className="btn btn-secondary">
                    Sudah jadi entri: buka editor
                  </Link>
                ) : (
                  <ActionForm action={createEntryFromProposalAction} id={p.id} label="Jadikan entri" variant="primary" />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="card" style={{ marginTop: "1.5rem" }}>
        <p style={{ marginTop: 0 }}>
          {created} dari {proposals.length} usulan sudah dijadikan entri.{" "}
          {change.state === "ditinjau"
            ? "PR ini sudah ditandai ditinjau."
            : "Bila sudah selesai memilih, tandai PR ini ditinjau supaya hilang dari Inbox."}
        </p>
        {change.state !== "ditinjau" && (
          <ActionForm action={finishProposalsAction} id={change.id} label="Selesai, tandai PR ditinjau" variant="primary" />
        )}
      </section>
    </>
  );
}
