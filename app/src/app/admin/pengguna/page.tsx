import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { listUsers } from "@/lib/users";
import { setActiveAction } from "./actions";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "Pengguna" };

export default async function PenggunaPage() {
  const admin = await requireAdmin();
  const users = listUsers();

  return (
    <>
      <div className="page-head">
        <h1>Pengguna</h1>
        <p className="muted" style={{ margin: 0 }}>
          Buat akun untuk tim Marketing dan Partner JV, atau nonaktifkan akun yang tidak lagi dipakai.
        </p>
      </div>
      <div className="stack">
        <section className="card card-narrow" aria-labelledby="buat-akun">
          <h2 id="buat-akun">Buat akun baru</h2>
          <CreateUserForm />
        </section>
        <section className="card" aria-labelledby="daftar-akun">
          <h2 id="daftar-akun">Semua akun ({users.length})</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Nama</th>
                  <th scope="col">Peran</th>
                  <th scope="col">Status</th>
                  <th scope="col">Login terakhir</th>
                  <th scope="col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <br />
                      <span className="muted">{u.email}</span>
                    </td>
                    <td>
                      {ROLE_LABEL[u.role]}
                      {u.partnerName && (
                        <>
                          <br />
                          <span className="muted">{u.partnerName}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${u.active ? "badge-siap" : "badge-internal"}`}>
                        {u.active ? "Aktif" : "Nonaktif"}
                      </span>
                      {u.mustChangePassword && (
                        <>
                          <br />
                          <span className="hint">Belum ganti kata sandi</span>
                        </>
                      )}
                    </td>
                    <td>{formatDateTime(u.lastLoginAt)}</td>
                    <td>
                      {u.id === admin.id ? (
                        <span className="muted">Akun Anda</span>
                      ) : (
                        <div className="item-actions">
                          <Link href={`/admin/pengguna/${u.id}`} className="btn btn-secondary">
                            Kelola<span className="visually-hidden"> {u.name}</span>
                          </Link>
                          <form action={setActiveAction}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="active" value={String(!u.active)} />
                            <button type="submit" className={`btn ${u.active ? "btn-danger" : "btn-secondary"}`}>
                              {u.active ? "Nonaktifkan" : "Aktifkan"}
                              <span className="visually-hidden"> {u.name}</span>
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
