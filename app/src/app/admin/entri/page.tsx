import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { listEntriesAdmin, parseAdminFilters } from "@/lib/admin-entries";
import { requireAdmin } from "@/lib/dal";
import { runDueSchedules } from "@/lib/schedule";
import { AUDIENCES, KINDS, STATUSES } from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { AUDIENCE_LABEL, KIND_LABEL, NATURE_LABEL, STATUS_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Semua entri" };

export default async function SemuaEntriPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  runDueSchedules();
  const filters = parseAdminFilters(await searchParams);
  const rows = listEntriesAdmin(filters);
  const filtered = Object.values(filters).some((value) => value !== undefined);

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <h1>Semua entri</h1>
          <p className="muted" style={{ margin: 0 }}>
            Urut dari yang terbaru diperbarui. Entri yang diarsipkan ikut tampil dan diberi tanda.
          </p>
        </div>
        <Link href="/admin/entri/baru" className="btn btn-primary">
          Entri baru
        </Link>
      </div>

      <form method="get" className="card filters" role="search" aria-label="Saring entri">
        <div className="field">
          <label htmlFor="q">Cari judul</label>
          <input id="q" name="q" className="input" defaultValue={filters.q ?? ""} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" className="select" defaultValue={filters.status ?? ""}>
            <option value="">Semua</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-audiens">Audiens</label>
          <select id="f-audiens" name="audiens" className="select" defaultValue={filters.audience ?? ""}>
            <option value="">Semua</option>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-jenis">Jenis</label>
          <select id="f-jenis" name="jenis" className="select" defaultValue={filters.kind ?? ""}>
            <option value="">Semua</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-terbit">Terbit</label>
          <select id="f-terbit" name="terbit" className="select" defaultValue={filters.published ?? ""}>
            <option value="">Semua</option>
            <option value="ya">Sudah terbit</option>
            <option value="tidak">Belum terbit</option>
          </select>
        </div>
        <div className="filters-actions">
          <button type="submit" className="btn btn-primary">
            Terapkan
          </button>
          {filtered && (
            <Link href="/admin/entri" className="btn btn-secondary">
              Reset
            </Link>
          )}
        </div>
      </form>

      <section className="card" aria-labelledby="hasil-entri">
        <h2 id="hasil-entri">
          {rows.length} entri{filtered ? " sesuai penyaringan" : ""}
        </h2>
        {rows.length === 0 ? (
          <p className="muted">
            {filtered ? "Tidak ada entri yang cocok. Coba longgarkan penyaringan." : "Belum ada entri."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th scope="col">Judul</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Sifat</th>
                  <th scope="col">Status</th>
                  <th scope="col">Audiens</th>
                  <th scope="col">Terbit</th>
                  <th scope="col">Diperbarui</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/entri/${row.id}`}>
                        <strong>{row.title}</strong>
                      </Link>
                    </td>
                    <td>{KIND_LABEL[row.kind]}</td>
                    <td>{NATURE_LABEL[row.nature]}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>{AUDIENCE_LABEL[row.audience]}</td>
                    <td>
                      {row.archivedAt ? (
                        <span className="badge badge-internal">Diarsipkan</span>
                      ) : (
                        <span className={`badge ${row.isPublished ? "badge-siap" : "badge-internal"}`}>
                          {row.isPublished ? "Ya" : "Belum"}
                        </span>
                      )}
                    </td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
