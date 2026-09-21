import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Inbox" };

export default async function Page() {
  await requireAdmin();
  return <ComingSoon title="Inbox" />;
}
