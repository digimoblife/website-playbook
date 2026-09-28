import { AdminSidebar } from "@/components/admin-sidebar";
import { requireAdmin } from "@/lib/dal";
import { ROLE_LABEL } from "@/lib/labels";
import { getProductName } from "@/lib/settings";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="admin-shell">
      <AdminSidebar userName={user.name} roleLabel={ROLE_LABEL[user.role]} productName={getProductName()} />
      <main id="konten" className="admin-main">
        {children}
      </main>
    </div>
  );
}
