import type { Session } from "next-auth";
import { auth } from "./auth";

/**
 * EPIC 031: the one, centralized server-side admin guard — consolidates
 * what used to be five byte-for-byte identical private `requireAdmin()`
 * functions (features/{invitations,memories,reports,users}/*-actions.ts,
 * features/messages/moderation-actions.ts). Every admin-only Server
 * Function should call this instead of re-implementing the check locally,
 * so there is exactly one place that decides "is this session an admin,"
 * not five copies that could silently drift apart.
 *
 * Reads `role` from the session `auth()` returns — which is always sourced
 * server-side from the database (Google's `upsertFromGoogleProfile`, or
 * Credentials' `authorize()`), never from anything a client sent — so this
 * check is real authorization, not a client-trusting shortcut. Deliberately
 * provider-agnostic: an admin is an admin whether they signed in with
 * Google or with the dedicated admin credentials (`session.user.authProvider`
 * is available on the returned user for any caller that specifically needs
 * to distinguish *how* the session was established, e.g. deciding whether
 * to ever offer a Google-specific action to it — but authorization itself
 * is `role`-based only, not provider-based, matching how this app has
 * always defined "admin").
 *
 * Returns `null` for "not admin" (whether unauthenticated or a real,
 * lesser-privileged account) — callers already uniformly treat "no admin
 * user" as one outcome (e.g. `{ ok: false, error: "unauthorized" }"`),
 * exactly as every existing duplicated copy of this function did.
 */
export async function requireAdmin(): Promise<Session["user"] | null> {
  const session = await auth();
  if (session?.user?.role !== "admin") return null;
  return session.user;
}
