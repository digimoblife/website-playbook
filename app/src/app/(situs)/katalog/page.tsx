import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/dal";
import { NEEDS_TAGS, parseNeedsTags, type NeedsTagKey } from "@/lib/domain";
import { listEntriesFor } from "@/lib/entries";
import { KIND_LABEL } from "@/lib/labels";
import { getWebsiteViewer } from "@/lib/preview";

export const metadata: Metadata = { title: "Katalog fitur" };

function isNeedsTagKey(value: string | undefined): value is NeedsTagKey {
  return !!value && NEEDS_TAGS.some((tag) => tag.key === value);
}

export default async function KatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const viewer = await getWebsiteViewer(user);
  const query = await searchParams;
  const rawTag = Array.isArray(query.tag) ? query.tag[0] : query.tag;
  const activeTag = isNeedsTagKey(rawTag) ? rawTag : undefined;

  const all = listEntriesFor(viewer).map((entry) => ({
    ...entry,
    tags: parseNeedsTags(entry.needsTags),
  }));
  const rows = activeTag ? all.filter((entry) => entry.tags.includes(activeTag)) : all;

  return (
    <>
      <div className="page-head">
        <h1>Katalog fitur</h1>
        <p className="muted" style={{ margin: 0 }}>
          Cari fitur berdasarkan kebutuhan toko, bukan nama modul teknis.
        </p>
      </div>

      <nav className="chip-row" aria-label="Saring berdasarkan kebutuhan">
        <Link href="/katalog" className="chip" aria-current={!activeTag ? "true" : undefined}>
          Semua
        </Link>
        {NEEDS_TAGS.map((tag) => (
          <Link
            key={tag.key}
            href={`/katalog?tag=${tag.key}`}
            className="chip"
            aria-current={activeTag === tag.key ? "true" : undefined}
          >
            {tag.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="card empty-state">
          <p style={{ margin: 0 }}>Belum ada fitur yang cocok untuk Anda di sini.</p>
        </div>
      ) : (
        <div className="catalog-grid">
          {rows.map((entry) => (
            <Link key={entry.id} href={`/entri/${entry.slug}`} className="card catalog-card">
              <h2>{entry.title}</h2>
              <div className="badges">
                <StatusBadge status={entry.status} />
                <span className="badge badge-role">{KIND_LABEL[entry.kind]}</span>
              </div>
              {entry.summary && (
                <p className="muted" style={{ margin: 0 }}>
                  {entry.summary}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
