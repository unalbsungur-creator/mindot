import { NextResponse, type NextRequest } from "next/server";
import { getTile } from "@/features/board/repository";

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

  const tile = await getTile(tileX, tileY, { from, to });
  return NextResponse.json(tile, {
    headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
  });
}
