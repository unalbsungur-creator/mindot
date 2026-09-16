import { requireAdmin } from "@/features/auth/requireAdmin";
import { getOpenReportQueue } from "@/features/reports/repository";
import { ReportsPageContent } from "./_components/ReportsPageContent";

export default async function ReportsPage() {
  const adminUser = await requireAdmin();
  const authorized = adminUser !== null;

  // Same shape as /admin/moderation's page.tsx: unauthorized visitors never
  // receive any report/message data in the payload — the fetch happens
  // only after the check, not filtered out afterward. The report actions
  // (resolveReport/dismissReport in features/reports/actions.ts) re-verify
  // admin status independently regardless of what a client sends.
  const items = authorized ? await getOpenReportQueue() : [];

  return <ReportsPageContent authorized={authorized} items={items} currentUserId={adminUser?.id ?? null} />;
}
