import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/dal";
import { getDemoStoreUrl } from "@/lib/demo-store";
import { formatDateTime } from "@/lib/format";
import { getGuideDetailBySlugFor } from "@/lib/guides";
import { getWebsiteViewer } from "@/lib/preview";

type Params = { slug: string };

async function loadGuide(slug: string) {
  const user = await requireUser();
  const viewer = await getWebsiteViewer(user);
  return getGuideDetailBySlugFor(viewer, slug);
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = await loadGuide(slug);
  return { title: guide?.title ?? "Panduan tidak ditemukan" };
}

export default async function PanduanDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const guide = await loadGuide(slug);
  // "Tidak ada" dan "tidak boleh dilihat" sengaja tidak dibedakan.
  if (!guide) notFound();
  const demoStoreUrl = getDemoStoreUrl();

  return (
    <div className="stack">
      <nav className="breadcrumb" aria-label="Navigasi">
        <Link href="/">Beranda</Link> / <Link href="/panduan">Panduan skenario</Link> /{" "}
        <span>{guide.title}</span>
      </nav>

      <section className="card">
        <StatusBadge status={guide.status} />
        <h1 style={{ margin: "0.5rem 0 0" }}>{guide.title}</h1>
        {guide.summary && <p style={{ margin: "0.5rem 0 0", fontSize: "1.0625rem" }}>{guide.summary}</p>}
        {demoStoreUrl && (
          <p style={{ margin: "1rem 0 0" }}>
            <a href={demoStoreUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              Buka toko demo (buka situs lain)
            </a>
          </p>
        )}
      </section>

      {guide.intro && (
        <section className="card">
          <h2>Kapan dipakai</h2>
          <p style={{ margin: 0, whiteSpace: "pre-line" }}>{guide.intro}</p>
        </section>
      )}

      {guide.steps.length > 0 && (
        <section className="card" aria-labelledby="langkah-heading">
          <h2 id="langkah-heading">Langkah</h2>
          <ol className="step-list">
            {guide.steps.map((step, index) => (
              <li key={index} className="step-row">
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <p style={{ margin: step.entry ? "0 0 0.25rem" : 0 }}>{step.text}</p>
                  {step.entry && (
                    <Link href={`/entri/${step.entry.slug}`} className="link-block">
                      Lihat fitur: {step.entry.title}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="muted" style={{ margin: 0 }}>
        Diperbarui terakhir {formatDateTime(guide.updatedAt)}
      </p>
    </div>
  );
}
