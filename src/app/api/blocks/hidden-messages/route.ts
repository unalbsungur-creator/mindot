import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/features/auth/auth";
import { listHiddenMessageIds } from "@/features/board/repository";

// Enough for any shared, pre-rendered set of notes (the homepage shows 4);
// a hard cap so this can't become a bulk lookup.
const MAX_IDS = 20;

/**
 * For pages rendered once for everyone (the ISR homepage): given the note
 * ids on screen, returns the ones the signed-in viewer has blocked the
 * author of, so the client can hide them. Private and uncached; signed-out
 * viewers simply get an empty list. Only ever reveals the viewer's own
 * block decisions, and never flags an anonymous note.
 */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean))].slice(0, MAX_IDS);

  const session = await auth();
  if (!session?.user?.id || ids.length === 0) return NextResponse.json({ hidden: [] }, { headers });

  return NextResponse.json({ hidden: await listHiddenMessageIds(ids, session.user.id) }, { headers });
}
