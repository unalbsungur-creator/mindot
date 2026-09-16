import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { AdminLoginPageContent } from "./_components/AdminLoginPageContent";

/**
 * EPIC 030: the admin-only, Google-independent sign-in screen. Reachable
 * directly (bookmark it) regardless of whether Google OAuth is working —
 * that's the entire point, see auth.ts's own doc comment. Already
 * `noindex`ed via admin/layout.tsx's shared metadata.
 */
export default async function AdminLoginPage() {
  const adminUser = await requireAdmin();
  if (adminUser !== null) {
    redirect("/admin");
  }

  return <AdminLoginPageContent />;
}
