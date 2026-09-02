import type { Metadata } from "next";
import { auth } from "@/features/auth/auth";
import { AdminNav } from "./_components/AdminNav";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Presentational only — every admin page/action independently re-checks
  // role itself before doing anything, exactly as before. This just decides
  // whether the cross-section nav is worth showing.
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <>
      {isAdmin && <AdminNav />}
      {children}
    </>
  );
}
