import type { Metadata } from "next";
import Link from "next/link";
import { getEditableEntry, listHistory } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { LIMITS } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Riwayat" };

function parsePositive(value: string | string[] | undefined): number | undefined {
  const text = Array.isArray(value) ? value[0] : value;
  return text && /^[1-9][0-9]{0,9}$/.test(text) ? Number(text) : undefined;
}

export default async function RiwayatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const entryId = parsePositive(query.entri);
  const requestedPage = parsePositive(query.halaman) ?? 1;
  const { rows, total, page, pages } = listHistory({ entryId, page: requestedPage });
  const entry = entryId ? getEditableEntry(entryId) : null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    if (entryId) params.set("entri", String(entryId));
    if (target > 1) params.set("halaman", String(target));
    const qs = params.toString();
    return qs ? `/admin/riwayat?${qs}` : "/admin/riwayat";
  };

  return (
    <>
      <div className="page-head">
        <h1>Riwayat</h1>
        <p className="muted" style={{ margin: 0 }}>
          Siapa mengubah apa dan kapan, dari semua entri. Waktu dalam WIB (Asia/Jakarta).
        </p>
      </div>

      {entryId && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0 }}>
            Hanya riwayat entri:{" "}
            {entry ? <Link href={`/admin/entri/${entry.id}`}>{entry.title}</Link> : `#${entryId} (tidak ditemukan)`}.{" "}
            <Link href="/admin/riwayat">Tampilkan semua entri</Link>
          </p>
        </div>
      )}

      <section className="card" aria-labelledby="daftar-riwayat">
        <h2 id="daftar-riwayat">
          {total} perubahan (halaman {page} dari {pages})
        </h2>
        {rows.length === 0 ? (
          <p className="muted">Belum ada riwayat.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Pengguna</th>
                  <th scope="col">Entri</th>
                  <th scope="col">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.at)}</td>
                    <td>{row.userName}</td>
                    <td>
                      <Link href={`/admin/entri/${row.entryId}`}>{row.entryTitle}</Link>
                    </td>
                    <td>{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="pagination" aria-label="Halaman riwayat">
            {page > 1 ? (
              <Link href={href(page - 1)} className="btn btn-secondary">
                Sebelumnya
              </Link>
            ) : (
              <span />
            )}
            <span className="muted">
              {LIMITS.historyPageSize} per halaman
            </span>
            {page < pages ? (
              <Link href={href(page + 1)} className="btn btn-secondary">
                Berikutnya
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </>
  );
}
