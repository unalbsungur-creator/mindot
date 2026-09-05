import type { Metadata } from "next";
import { auth } from "@/features/auth/auth";
import { messageRepository } from "@/features/messages/repository";
import { reportRepository } from "@/features/reports/repository";
import { AdminNav } from "./_components/AdminNav";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Presentational only — every admin page/action independently re-checks
  // role itself before doing anything, exactly as before. This just decides
  // whether the cross-section nav is worth showing.
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  // EPIC 022: pending-moderation / open-report counts for the nav badges —
  // fetched here, server-side, only behind the same isAdmin gate as the nav
  // itself, so a non-admin session never triggers these queries or receives
  // the numbers in any payload. Two single aggregate `count(*)` queries,
  // same shape as messageRepository.countApproved().
  const [pendingModerationCount, openReportCount] = isAdmin
    ? await Promise.all([messageRepository.countPending(), reportRepository.countOpen()])
    : [0, 0];

  return (
    <>
      {isAdmin && <AdminNav pendingModerationCount={pendingModerationCount} openReportCount={openReportCount} />}
      {children}
    </>
  );
}
