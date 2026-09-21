import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import { getUserDetail } from "@/lib/users";
import { EditUserForm } from "./edit-user-form";
import { ResetPasswordPanel } from "./reset-password-panel";

export const metadata: Metadata = { title: "Kelola pengguna" };

export default async function KelolaPenggunaPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!/^[1-9][0-9]{0,9}$/.test(id)) notFound();
  const user = getUserDetail(Number(id));
  if (!user) notFound();

  return (
    <>
      <div className="page-head">
        <h1>{user.name}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {ROLE_LABEL[user.role]} · {user.active ? "Aktif" : "Nonaktif"} · Login terakhir {formatDateTime(user.lastLoginAt)}
          {user.mustChangePassword ? " · Belum mengganti kata sandi sementara" : ""}
        </p>
      </div>

      {user.id === admin.id ? (
        <section className="card card-narrow">
          <p>
            Ini akun Anda sendiri. Untuk mengganti kata sandi, pakai menu <Link href="/ganti-kata-sandi">Ganti kata
            sandi</Link>. Bila kata sandi terlupa, jalankan <code>npm run admin:reset</code> di terminal server.
          </p>
          <Link href="/admin/pengguna" className="btn btn-secondary">
            Kembali ke Pengguna
          </Link>
        </section>
      ) : (
        <div className="stack">
          <section className="card card-narrow" aria-labelledby="data-akun">
            <h2 id="data-akun">Data akun</h2>
            <EditUserForm
              user={{ id: user.id, name: user.name, email: user.email, role: user.role, partnerName: user.partnerName }}
            />
          </section>
          <section className="card card-narrow" aria-labelledby="reset-sandi">
            <h2 id="reset-sandi">Reset kata sandi</h2>
            <p className="muted">
              Membuat kata sandi sementara baru (tampil sekali), mencabut semua sesi pengguna ini, dan mewajibkannya
              mengganti kata sandi saat masuk berikutnya.
            </p>
            <ResetPasswordPanel userId={user.id} userName={user.name} />
          </section>
          <p>
            <Link href="/admin/pengguna" className="link-block">Kembali ke Pengguna</Link>
          </p>
        </div>
      )}
    </>
  );
}
