import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { listEntriesFor } from "@/lib/entries";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/labels";
import { getWebsiteViewer } from "@/lib/preview";

export default async function BerandaPage() {
  const user = await requireUser();
  const viewer = await getWebsiteViewer(user);
  const visible = listEntriesFor(viewer);
  const newest = visible
    .filter((entry) => entry.publishedAt)
    .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
    .slice(0, 3);

  return (
    <div className="stack">
      <section className="card">
        <h1>Halo, {user.name}.</h1>
        <p style={{ margin: 0 }}>
          <span className="badge badge-role">{ROLE_LABEL[user.role]}</span>
        </p>
      </section>

      <section aria-labelledby="tujuan-heading">
        <h2 id="tujuan-heading" className="visually-hidden">
          Pilih tujuan Anda
        </h2>
        <div className="goal-grid">
          <Link href="/baru" className="card goal-card">
            <h2>Saya ingin tahu yang baru</h2>
            <p className="muted" style={{ margin: 0 }}>
              Lihat daftar fitur dan pembaruan yang sudah bisa dibicarakan ke luar tim.
            </p>
          </Link>
          <Link href="/katalog" className="card goal-card">
            <h2>Saya ingin belajar cara pakai</h2>
            <p className="muted" style={{ margin: 0 }}>
              Jelajahi katalog fitur, cari berdasarkan kebutuhan toko, lalu buka panduan pakainya.
            </p>
          </Link>
          <Link href="/katalog" className="card goal-card">
            <h2>Saya butuh materi promosi</h2>
            <p className="muted" style={{ margin: 0 }}>
              Buka fitur yang dibutuhkan di katalog — teks promosi dan gambarnya ada di tiap
              halaman fitur, bukan di daftar tersendiri.
            </p>
          </Link>
        </div>
      </section>

      <section aria-labelledby="baru-minggu-ini">
        <h2 id="baru-minggu-ini">Baru minggu ini</h2>
        {newest.length === 0 ? (
          <p className="muted">Belum ada yang dipublikasikan untuk Anda.</p>
        ) : (
          <ul className="entry-list">
            {newest.map((entry) => (
              <li key={entry.id} className="entry-item">
                <h2>
                  <Link href={`/entri/${entry.slug}`}>{entry.title}</Link>
                </h2>
                <div className="badges">
                  <StatusBadge status={entry.status} />
                  <span className="muted">Diumumkan {formatDateTime(entry.publishedAt)}</span>
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
      </section>
    </div>
  );
}
