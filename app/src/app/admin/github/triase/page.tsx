import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { countNewGithubChanges, listNewGithubChanges } from "@/lib/github-changes";
import { ChangeItem } from "../change-item";

export const metadata: Metadata = { title: "Perbaikan dan Arsip GitHub" };

const LISTS = {
  perbaikan: {
    title: "Perbaikan",
    intro: "Commit dan PR bertipe fix. Jarang perlu entri Playbook; tinjau sesekali.",
  },
  arsip: {
    title: "Arsip GitHub",
    intro: "Commit dan PR bertipe docs, test, chore, style, dan copy. Disaring otomatis karena bukan fitur.",
  },
} as const;

export default async function TriasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const raw = (await searchParams).daftar;
  const daftar = raw === "arsip" ? "arsip" : "perbaikan";
  const rows = listNewGithubChanges(daftar);
  const counts = countNewGithubChanges();
  const info = LISTS[daftar];

  return (
    <>
      <div className="page-head">
        <h1>{info.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {info.intro} Yang keliru disaring bisa dijadikan kandidat lagi.
        </p>
      </div>
      <nav className="chip-row" aria-label="Pilih daftar">
        <Link href="/admin" className="chip">
          Kandidat di Inbox ({counts.kandidat})
        </Link>
        <Link href="/admin/github/triase?daftar=perbaikan" className="chip" aria-current={daftar === "perbaikan" ? "true" : undefined}>
          Perbaikan ({counts.perbaikan})
        </Link>
        <Link href="/admin/github/triase?daftar=arsip" className="chip" aria-current={daftar === "arsip" ? "true" : undefined}>
          Arsip GitHub ({counts.arsip})
        </Link>
      </nav>
      {rows.length === 0 ? (
        <div className="card empty-state">
          <p style={{ margin: 0 }}>Tidak ada perubahan di daftar ini.</p>
        </div>
      ) : (
        <ul className="entry-list">
          {rows.map((change) => (
            <ChangeItem key={change.id} change={change} />
          ))}
        </ul>
      )}
    </>
  );
}
