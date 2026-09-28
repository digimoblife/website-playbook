import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { formatDateTime } from "@/lib/format";
import { isWaitingTooLong, type GithubChangeRow } from "@/lib/github-changes";
import { KIND_LABEL } from "@/lib/labels";
import {
  createEntryFromCommitAction,
  draftFromPullRequestAction,
  markChangeReviewedAction,
  setChangeBucketAction,
} from "./actions";

const MOVE_LABEL = { kandidat: "Jadikan kandidat", perbaikan: "Ke Perbaikan", arsip: "Ke Arsip" } as const;

/** Satu perubahan dari GitHub beserta hasil triase dan tombol tindak lanjutnya (hanya Admin). */
export function ChangeItem({ change }: { change: GithubChangeRow }) {
  const label = change.kind === "pr" ? `PR #${change.prNumber}` : `Commit ${change.commitSha?.slice(0, 7)}`;
  const moves = (["kandidat", "perbaikan", "arsip"] as const).filter((b) => b !== change.bucket);
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
        {change.commitType && <span className="badge badge-internal">{change.commitType}</span>}
        <span className="badge badge-beta" title={change.kindGuess.reason}>
          {change.matchedEntry ? "" : "Tebakan: "}
          {KIND_LABEL[change.kindGuess.kind]}
        </span>
        {change.kindGuess.area && <span className="muted">{change.kindGuess.area}</span>}
        <span className="muted">{formatDateTime(change.happenedAt)}</span>
        {isWaitingTooLong(change.receivedAt) && <span className="badge badge-beta">Menunggu lebih dari 7 hari</span>}
      </div>
      <p className="note" style={{ margin: 0 }}>
        Jenis {change.matchedEntry ? "dari peta fitur" : "ditebak"}: {change.kindGuess.reason}.
        {change.files.length > 0 &&
          ` ${change.files.length} file berubah: ${change.files.slice(0, 5).join(", ")}${change.files.length > 5 ? ", …" : ""}`}
      </p>
      <div className="item-actions">
        {change.matchedEntry ? (
          <Link href={`/admin/entri/${change.matchedEntry.id}`} className="btn btn-primary">
            Buka entri
          </Link>
        ) : change.kind === "pr" ? (
          <>
            <ActionForm action={draftFromPullRequestAction} id={change.id} label="Buat draf AI" variant="primary" />
            <Link href={`/admin/github/usulan/${change.id}`} className="btn btn-secondary">
              Lihat usulan
            </Link>
          </>
        ) : (
          <ActionForm action={createEntryFromCommitAction} id={change.id} label="Buat entri" variant="primary" />
        )}
        <ActionForm action={markChangeReviewedAction} id={change.id} label="Tandai ditinjau" />
        {moves.map((bucket) => (
          <ActionForm
            key={bucket}
            action={setChangeBucketAction}
            id={change.id}
            extra={{ bucket }}
            label={MOVE_LABEL[bucket]}
          />
        ))}
      </div>
    </li>
  );
}
