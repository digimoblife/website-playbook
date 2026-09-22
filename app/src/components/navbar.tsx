import Link from "next/link";
import { logout } from "@/app/actions/logout";
import type { SessionUser } from "@/lib/auth";
import type { PreviewRole } from "@/lib/preview-constants";
import { PreviewSwitch } from "@/components/preview-switch";

export function Navbar({
  user,
  previewRole,
}: {
  user: SessionUser;
  /** Diisi hanya untuk Admin (lihat lib/preview.ts). Marketing/Partner sungguhan: null. */
  previewRole?: PreviewRole | null;
}) {
  return (
    <>
      {/* .navbar punya tinggi tetap (--navbar-height), jadi pita pratinjau HARUS di luar
          <header> ini sebagai baris kedua, bukan di dalamnya — kalau tidak, keduanya akan
          saling menimpa karena header dipaksa muat dalam satu tinggi baris navbar saja. */}
      <header className="navbar">
        <div className="navbar-inner">
          <Link href="/" className="brand">
            Lapaq Playbook
          </Link>
          <nav aria-label="Menu utama" className="navbar-nav">
            <Link href="/baru" className="nav-link">
              Apa yang baru
            </Link>
            <Link href="/katalog" className="nav-link">
              Katalog
            </Link>
            {user.role === "admin" && (
              <Link href="/admin" className="nav-link">
                Dashboard admin
              </Link>
            )}
            <Link href="/ganti-kata-sandi" className="nav-link">
              Ganti kata sandi
            </Link>
            <span className="navbar-user">{user.name}</span>
            <form action={logout}>
              <button type="submit" className="btn btn-secondary">
                Keluar
              </button>
            </form>
          </nav>
        </div>
      </header>
      {previewRole && <PreviewSwitch role={previewRole} />}
    </>
  );
}
