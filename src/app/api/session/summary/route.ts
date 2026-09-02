import { NextResponse } from "next/server";
import { auth } from "@/features/auth/auth";

/**
 * A narrow, safe summary of the current session — `{name, image, isAdmin}`
 * or `null`, never the full session object (no id, no email, no raw
 * `role` string). `isAdmin` (EPIC 016) is a derived boolean purpose-built
 * for `SiteHeader`'s admin nav-link visibility — showing/hiding a link is
 * a discoverability convenience, not a security boundary, since every
 * `/admin/*` page and Server Function independently re-verifies
 * `session.user.role === "admin"` itself regardless of what this endpoint
 * or the client claims. `SiteHeader` fetches this client-side (rather
 * than the root layout calling `auth()` server-side and passing it down)
 * specifically so pages like the homepage can stay statically
 * prerendered instead of every page becoming request-dynamic just to
 * know whether to show an avatar.
 */
export async function GET() {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name ?? null, image: session.user.image ?? null, isAdmin: session.user.role === "admin" }
    : null;
  return NextResponse.json(user);
}
