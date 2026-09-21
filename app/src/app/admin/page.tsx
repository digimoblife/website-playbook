import type { Metadata } from "next";
import { StatusBadge } from "@/components/status-badge";
import { STATUSES } from "@/lib/domain";
import { requireAdmin } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Dashboard admin" };

const STATUS_MEANING = {
  internal: "Default untuk semua draf baru; belum boleh dibicarakan ke luar tim.",
  beta: "Sudah bisa dicoba tetapi terbatas; boleh disebut dengan hati-hati.",
  siap: "Sudah stabil dan boleh dipromosikan.",
} as const;

export default async function AdminBerandaPage() {
  const user = await requireAdmin();
  return (
    <>
      <div className="page-head">
        <h1>Halo, {user.name}.</h1>
        <span className="badge badge-role">{ROLE_LABEL[user.role]}</span>
      </div>
      <section className="card" aria-labelledby="status-konten">
        <h2 id="status-konten">Status konten</h2>
        <ul className="legend">
          {STATUSES.map((status) => (
            <li key={status}>
              <StatusBadge status={status} />
              <span>{STATUS_MEANING[status]}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
