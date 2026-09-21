import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/dal";

// Inbox sekarang ada di /admin. Alamat lama dipertahankan supaya tautan lama tetap jalan.
export default async function InboxLamaPage() {
  await requireAdmin();
  redirect("/admin");
}
