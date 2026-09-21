import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { homePathFor } from "@/lib/labels";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function MasukPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/ganti-kata-sandi" : homePathFor(user.role));

  return (
    <>
      <Link href="/masuk" className="brand">
        Lapaq Playbook
      </Link>
      <div className="card">
        <h1>Masuk</h1>
        <p className="muted">Gunakan akun yang diberikan oleh Product Manager.</p>
        <LoginForm />
      </div>
    </>
  );
}
