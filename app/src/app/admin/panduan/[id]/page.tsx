import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { getEditableGuide, listGuideHistory, listLinkableEntries } from "@/lib/guides";
import { GuideEditor } from "./guide-editor";

export const metadata: Metadata = { title: "Editor panduan" };

export default async function EditorPanduanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  const guide = getEditableGuide(Number(id));
  if (!guide) notFound();
  const history = listGuideHistory(guide.id, 30);

  return (
    <>
      <GuideEditor guide={guide} linkable={listLinkableEntries()} />
      <section className="card" aria-labelledby="riwayat-panduan" style={{ marginTop: "1.5rem" }}>
        <h2 id="riwayat-panduan">Riwayat perubahan</h2>
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
      </section>
    </>
  );
}
