import { NextResponse, type NextRequest } from "next/server";
import { searchPublicMessages } from "@/features/board/repository";

const MAX_KEYWORD_LENGTH = 100;

/**
 * EPIC 021: board discovery's only endpoint. Public, no sign-in required
 * — same policy as `/api/board`, since the underlying data is the same
 * already-public, approved-only board content; the only thing new here is
 * the query shape (keyword/date, not tileX/tileY). Deliberately refuses a
 * request with no filter at all (400) rather than treating it as "return
 * the most recent N approved messages" — see `searchPublicMessages`'s own
 * doc comment for why that boundary matters.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawKeyword = searchParams.get("query")?.trim() ?? "";
  const keyword = rawKeyword ? rawKeyword.slice(0, MAX_KEYWORD_LENGTH) : undefined;

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((fromParam && Number.isNaN(from?.getTime())) || (toParam && Number.isNaN(to?.getTime()))) {
    return NextResponse.json({ error: "from/to must be valid dates" }, { status: 400 });
  }

  if (!keyword && !from && !to) {
    return NextResponse.json({ error: "query, from, or to is required" }, { status: 400 });
  }

  const results = await searchPublicMessages({ keyword, from, to });
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } }
  );
}
