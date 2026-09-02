import { redirect } from "next/navigation";

/**
 * EPIC 016: `/admin` itself had no `page.tsx` — only `layout.tsx` plus
 * nested segments (`moderation/`, `invitations/`, `access-codes/`,
 * `orders/`) existed, so the bare URL fell through to the app's
 * `not-found.tsx`. Fixed as a plain redirect to the existing moderation
 * page — the primary admin function per the existing architecture — never
 * a second dashboard duplicating what `AdminNav` (rendered by
 * `admin/layout.tsx` on every nested admin route already) already does.
 * Unconditional on purpose: `/admin/moderation` independently re-verifies
 * `session.user.role === "admin"` itself and renders the same "Admins
 * only" panel either way, so this redirect is not and does not need to be
 * a security boundary — it's routing only.
 */
export default function AdminIndexPage() {
  redirect("/admin/moderation");
}
