"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/format";
import type { PullRequestWithStatus } from "@/lib/github-import-status";
import { pullFromGithubAction } from "./actions";

type Notice = { ok: boolean; text: string; href?: string } | null;

export function GithubPullTable({ pullRequests }: { pullRequests: PullRequestWithStatus[] }) {
  const [pending, startTransition] = useTransition();
  const [busyNumber, setBusyNumber] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  function pull(pr: PullRequestWithStatus) {
    setBusyNumber(pr.number);
    startTransition(async () => {
      const res = await pullFromGithubAction(pr.number);
      setNotice(
        res.ok
          ? { ok: true, text: `Entri baru dibuat dari PR #${pr.number}.`, href: `/admin/entri/${res.entryId}` }
          : { ok: false, text: res.error },
      );
      setBusyNumber(null);
    });
  }

  return (
    <>
      {notice && (
        <div
          role={notice.ok ? "status" : "alert"}
          className={`alert notice ${notice.ok ? "alert-success" : "alert-danger"}`}
        >
          {notice.text} {notice.href && <Link href={notice.href}>Buka editor entri</Link>}
        </div>
      )}
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th scope="col">PR</th>
              <th scope="col">Judul</th>
              <th scope="col">Terakhir diperbarui</th>
              <th scope="col">Status penarikan</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {pullRequests.map((pr) => {
              const busy = pending && busyNumber === pr.number;
              const alreadyPulled = pr.imports.length > 0;
              return (
                <tr key={pr.number}>
                  <td>
                    <a href={pr.url} target="_blank" rel="noopener noreferrer">
                      #{pr.number}
                    </a>
                  </td>
                  <td>{pr.title}</td>
                  <td>{formatDateTime(new Date(pr.updatedAt))}</td>
                  <td>
                    {alreadyPulled ? (
                      <span className="badge badge-siap">
                        Sudah ditarik ({pr.imports.length}×)
                      </span>
                    ) : (
                      <span className="badge badge-internal">Belum ditarik</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => pull(pr)}
                    >
                      {busy ? "Memproses…" : alreadyPulled ? "Tarik lagi" : "Tarik sekarang"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
