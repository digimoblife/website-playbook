import { Navbar } from "@/components/navbar";
import { isAdmin } from "@/lib/access";
import { requireUser } from "@/lib/dal";
import { getPreviewRole } from "@/lib/preview";
import { getProductName } from "@/lib/settings";

export default async function SitusLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Hanya Admin yang punya peran pratinjau; untuk Marketing/Partner sungguhan ini tetap null,
  // jadi Navbar tidak menampilkan kontrol pratinjau sama sekali untuk mereka.
  const previewRole = isAdmin(user) ? await getPreviewRole() : null;
  return (
    <>
      <Navbar user={user} previewRole={previewRole} productName={getProductName()} />
      <main id="konten" className="container">
        {children}
      </main>
    </>
  );
}
