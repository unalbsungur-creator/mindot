import { redirect } from "next/navigation";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { optionalEnv } from "@/lib/env";
import { AdminLoginPageContent } from "./_components/AdminLoginPageContent";

/**
 * EPIC 030: the admin-only, Google-independent sign-in screen. Reachable
 * directly (bookmark it) regardless of whether Google OAuth is working —
 * that's the entire point, see auth.ts's own doc comment. Already
 * `noindex`ed via admin/layout.tsx's shared metadata.
 *
 * GÖREV 30 / P1: the public Turnstile site key is read here at request time
 * (not inlined at build) and passed to the client form. When it's unset the
 * form shows an unavailable state and blocks submission — and the server
 * fails closed independently, since verifyAdminCredentials requires a valid
 * token regardless of what the client does.
 */
export default async function AdminLoginPage() {
  const adminUser = await requireAdmin();
  if (adminUser !== null) {
    redirect("/admin");
  }

  return <AdminLoginPageContent turnstileSiteKey={optionalEnv("TURNSTILE_SITE_KEY") ?? null} />;
}
