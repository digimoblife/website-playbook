import { AdminSidebar } from "@/components/admin-sidebar";
import { requireAdmin } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/labels";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="admin-shell">
      <AdminSidebar userName={user.name} roleLabel={ROLE_LABEL[user.role]} />
      <main id="konten" className="admin-main">
        {children}
      </main>
    </div>
  );
}
