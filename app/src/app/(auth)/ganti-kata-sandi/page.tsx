import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { homePathFor } from "@/lib/labels";
import { getProductName } from "@/lib/settings";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Ganti kata sandi" };

export default async function GantiKataSandiPage() {
  const user = await requireUser({ allowPasswordChange: true });

  return (
    <>
      <span className="brand" style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
        {getProductName()} Playbook
      </span>
      <div className="card">
        <h1>Ganti kata sandi</h1>
        {user.mustChangePassword ? (
          <p className="alert alert-danger" role="status">
            Kata sandi Anda masih sementara. Buat kata sandi baru untuk melanjutkan.
          </p>
        ) : (
          <p className="muted">
            Setelah diganti, Anda akan keluar dari perangkat lain.{" "}
            <Link href={homePathFor(user.role)}>Kembali</Link>
          </p>
        )}
        <ChangePasswordForm />
      </div>
    </>
  );
}
