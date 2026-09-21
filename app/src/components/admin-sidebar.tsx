"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/logout";

const MENU = [
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/entri", label: "Semua entri" },
  { href: "/admin/arsip", label: "Arsip" },
  { href: "/admin/riwayat", label: "Riwayat" },
  { href: "/admin/pengguna", label: "Pengguna" },
];

export function AdminSidebar({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/admin" className="brand">
        Lapaq Playbook
      </Link>
      <nav aria-label="Menu dashboard" className="sidebar-nav">
        {MENU.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="sidebar-link"
            aria-current={pathname === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div>
          <strong>{userName}</strong>
          <br />
          {roleLabel}
        </div>
        <Link href="/" className="sidebar-link">
          Lihat website
        </Link>
        <Link href="/ganti-kata-sandi" className="sidebar-link">
          Ganti kata sandi
        </Link>
        <form action={logout}>
          <button type="submit" className="btn">
            Keluar
          </button>
        </form>
      </div>
    </aside>
  );
}
