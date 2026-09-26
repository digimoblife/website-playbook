import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEditableEntry, listEntryHistory } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { runDueSchedules } from "@/lib/schedule";
import { formatDateTime } from "@/lib/format";
import { EntryEditor } from "./entry-editor";

export const metadata: Metadata = { title: "Editor entri" };

export default async function EditorEntriPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  runDueSchedules();
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  const entry = getEditableEntry(Number(id));
  if (!entry) notFound();
  const history = listEntryHistory(entry.id, 30);

  return (
    <>
      <EntryEditor entry={entry} />
      <section className="card" aria-labelledby="riwayat-entri" style={{ marginTop: "1.5rem" }}>
        <h2 id="riwayat-entri">Riwayat perubahan</h2>
        <ol className="history-list">
          {history.map((row) => (
            <li key={row.id}>
              <span className="history-time">{formatDateTime(row.at)}</span>
              <span>
                <strong>{row.userName}</strong>: {row.summary}
              </span>
            </li>
          ))}
        </ol>
        <p style={{ margin: "1rem 0 0" }}>
          <Link href={`/admin/riwayat?entri=${entry.id}`} className="link-block">
            Lihat semua riwayat entri ini
          </Link>
        </p>
      </section>
    </>
  );
}
