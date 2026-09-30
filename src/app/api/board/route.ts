import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/features/auth/auth";
import { getTile } from "@/features/board/repository";

/**
 * Two deliberately separate response kinds, told apart by the URL itself so
 * no cache (browser or CDN) can ever hand one viewer's filtered tile to
 * someone else:
 *   - default: the public tile — never reads the session, identical for
 *     everyone, publicly cacheable exactly as before user blocking existed;
 *   - `?personal=1`: the signed-in viewer's tile with authors they've
 *     blocked filtered out — `private, no-store`, never shared.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tileX = Number(searchParams.get("tileX"));
  const tileY = Number(searchParams.get("tileY"));

  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
    return NextResponse.json({ error: "tileX and tileY must be integers" }, { status: 400 });
  }

  // Time-exploration foundation (EPIC 004 section 14): accepted here so the
  // query layer is ready, but no UI sends these yet.
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((fromParam && Number.isNaN(from?.getTime())) || (toParam && Number.isNaN(to?.getTime()))) {
    return NextResponse.json({ error: "from/to must be valid dates" }, { status: 400 });
  }

  if (searchParams.get("personal") === "1") {
    const session = await auth();
    const tile = await getTile(tileX, tileY, { from, to }, session?.user?.id);
    return NextResponse.json(tile, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  }

  const tile = await getTile(tileX, tileY, { from, to });
  return NextResponse.json(tile, {
    headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
  });
}
