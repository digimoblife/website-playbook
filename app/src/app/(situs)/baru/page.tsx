import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/dal";
import { listEntriesFor } from "@/lib/entries";
import { formatDateTime } from "@/lib/format";
import { getWebsiteViewer } from "@/lib/preview";

export const metadata: Metadata = { title: "Apa yang baru" };

export default async function ApaYangBaruPage() {
  const user = await requireUser();
  const viewer = await getWebsiteViewer(user);
  const rows = listEntriesFor(viewer).sort((a, b) => {
    const aTime = a.publishedAt?.getTime() ?? 0;
    const bTime = b.publishedAt?.getTime() ?? 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return (
    <>
      <div className="page-head">
        <h1>Apa yang baru</h1>
        <p className="muted" style={{ margin: 0 }}>
          Perubahan dan fitur yang sudah bisa dibicarakan, terbaru di atas.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">
          <p style={{ margin: 0 }}>Belum ada yang dipublikasikan untuk Anda.</p>
        </div>
      ) : (
        <ul className="entry-list">
          {rows.map((entry) => (
            <li key={entry.id} className="entry-item">
              <h2>
                <Link href={`/entri/${entry.slug}`}>{entry.title}</Link>
              </h2>
              <div className="badges">
                <StatusBadge status={entry.status} />
                <span className="muted">{formatDateTime(entry.publishedAt)}</span>
              </div>
              {entry.summary && (
                <p className="muted" style={{ margin: 0 }}>
                  {entry.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
