import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { FeedbackWidget } from "@/components/feedback-widget";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/dal";
import { getEntryDetailBySlugFor, type EntryDetailForReader } from "@/lib/entries";
import { formatDateTime } from "@/lib/format";
import { getWebsiteViewer } from "@/lib/preview";

type Params = { slug: string };

/**
 * Isi "Jangan dijanjikan", atau null bila kuncinya memang tidak ada di objek (Partner) atau
 * kosong. Dipisah supaya TypeScript menyempitkan tipenya di satu tempat, bukan diperiksa dua
 * cara berbeda yang bisa lupa disinkronkan.
 */
function cannotPromiseText(entry: EntryDetailForReader): string | null {
  return "cannotPromise" in entry && entry.cannotPromise ? entry.cannotPromise : null;
}

async function loadEntry(slug: string) {
  const user = await requireUser();
  const viewer = await getWebsiteViewer(user);
  return { user, entry: getEntryDetailBySlugFor(viewer, slug) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { entry } = await loadEntry(slug);
  return { title: entry?.title ?? "Fitur tidak ditemukan" };
}

export default async function EntriPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const { user, entry } = await loadEntry(slug);
  // "Tidak ada" dan "tidak boleh dilihat" sengaja tidak dibedakan (sama seperti getEntryBySlugFor).
  if (!entry) notFound();

  const cannotPromise = cannotPromiseText(entry);
  // Umpan balik mengukur pembaca sungguhan; Admin (asli maupun berpratinjau) tidak melihat ini.
  const canGiveFeedback = user.role === "marketing" || user.role === "partner";

  return (
    <div className="stack">
      <nav className="breadcrumb" aria-label="Navigasi">
        <Link href="/">Beranda</Link> / <Link href="/katalog">Katalog</Link> /{" "}
        <span>{entry.title}</span>
      </nav>

      <section className="card">
        <StatusBadge status={entry.status} />
        <h1 style={{ margin: "0.5rem 0 0" }}>{entry.title}</h1>
        {entry.summary && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "1.0625rem" }}>{entry.summary}</p>
        )}
      </section>

      {(entry.forWhom || entry.problem) && (
        <section className="card stack">
          {entry.forWhom && (
            <div>
              <h2>Untuk toko seperti apa</h2>
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{entry.forWhom}</p>
            </div>
          )}
          {entry.problem && (
            <div>
              <h2>Masalah yang diselesaikan</h2>
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{entry.problem}</p>
            </div>
          )}
        </section>
      )}

      {entry.images.length > 0 && (
        <section className="card" aria-labelledby="galeri-heading">
          <h2 id="galeri-heading">Cara kerja</h2>
          <ul className="image-grid">
            {entry.images.map((image, index) => (
              <li key={image.id} className="image-item">
                {/* eslint-disable-next-line @next/next/no-img-element -- gambar dilayani rute /media yang wajib login */}
                <img
                  className="thumb"
                  src={`/media/${image.id}`}
                  alt={`Gambar ${index + 1}: ${entry.title}`}
                  loading="lazy"
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {entry.steps.length > 0 && (
        <section className="card" aria-labelledby="cara-pakai-heading">
          <h2 id="cara-pakai-heading">Cara pakai</h2>
          <ol className="step-list">
            {entry.steps.map((step, index) => (
              <li key={index} className="step-row">
                <span className="step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <p style={{ margin: step.mediaId ? "0 0 0.5rem" : 0 }}>{step.text}</p>
                  {step.mediaId && (
                    // eslint-disable-next-line @next/next/no-img-element -- gambar dilayani rute /media yang wajib login
                    <img
                      className="thumb"
                      src={`/media/${step.mediaId}`}
                      alt={`Gambar untuk langkah ${index + 1}`}
                      loading="lazy"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(entry.canPromise || cannotPromise) && (
        <section className="card stack">
          {entry.canPromise && (
            <div>
              <h2>Boleh dijanjikan</h2>
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{entry.canPromise}</p>
            </div>
          )}
          {cannotPromise && (
            <div>
              <h2>Jangan dijanjikan</h2>
              <p style={{ margin: 0, whiteSpace: "pre-line" }}>{cannotPromise}</p>
            </div>
          )}
        </section>
      )}

      {entry.promoText && (
        <section className="card">
          <h2>Materi siap pakai</h2>
          <p style={{ whiteSpace: "pre-line" }}>{entry.promoText}</p>
          <CopyButton text={entry.promoText} />
        </section>
      )}

      <p className="muted" style={{ margin: 0 }}>
        Diperbarui terakhir {formatDateTime(entry.updatedAt)}
      </p>

      {canGiveFeedback && (
        <section className="card" aria-labelledby="feedback-heading">
          <h2 id="feedback-heading">Apakah halaman ini membantu?</h2>
          <FeedbackWidget entryId={entry.id} />
        </section>
      )}
    </div>
  );
}
