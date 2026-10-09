import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/features/auth/auth";
import { authenticateMobileRequest } from "@/features/auth/mobileService";
import { getTile } from "@/features/board/repository";
import { resolveBoardViewer } from "./lib/boardHandler";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};

/**
 * Public requests never read a session and retain public caching.
 * Personal requests require an authenticated web session or valid mobile
 * Bearer token and are never shared through caches.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tileX = Number(searchParams.get("tileX"));
  const tileY = Number(searchParams.get("tileY"));

  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) {
    return NextResponse.json(
      { error: "tileX and tileY must be integers" },
      { status: 400 },
    );
  }

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;

  if (
    (fromParam && Number.isNaN(from?.getTime())) ||
    (toParam && Number.isNaN(to?.getTime()))
  ) {
    return NextResponse.json(
      { error: "from/to must be valid dates" },
      { status: 400 },
    );
  }

  if (searchParams.get("personal") === "1") {
    const authorizationHeader = request.headers.get("authorization");
    const session = authorizationHeader === null ? await auth() : null;
    const viewer = await resolveBoardViewer(
      authorizationHeader,
      session?.user?.id,
      { authenticateMobile: authenticateMobileRequest },
    );

    if (!viewer.ok) {
      return NextResponse.json(
        { error: viewer.error },
        { status: viewer.status, headers: PRIVATE_HEADERS },
      );
    }

    const tile = await getTile(tileX, tileY, { from, to }, viewer.viewerId);
    return NextResponse.json(tile, { headers: PRIVATE_HEADERS });
  }

  const tile = await getTile(tileX, tileY, { from, to });
  return NextResponse.json(tile, {
    headers: {
      "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
    },
  });
}
