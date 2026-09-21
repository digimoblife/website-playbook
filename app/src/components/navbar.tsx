import Link from "next/link";
import { logout } from "@/app/actions/logout";
import type { SessionUser } from "@/lib/auth";

export function Navbar({ user }: { user: SessionUser }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          Lapaq Playbook
        </Link>
        <nav aria-label="Menu utama" className="navbar-nav">
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
  );
}
