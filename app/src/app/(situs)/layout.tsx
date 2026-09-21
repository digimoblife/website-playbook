import { Navbar } from "@/components/navbar";
import { requireUser } from "@/lib/dal";

export default async function SitusLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Navbar user={user} />
      <main id="konten" className="container">
        {children}
      </main>
    </>
  );
}
