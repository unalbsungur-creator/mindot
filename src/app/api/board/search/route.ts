import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/features/auth/auth";
import { authenticateMobileRequest } from "@/features/auth/mobileService";
import { searchPublicMessages } from "@/features/board/repository";
import type { NoteTemplateCategory } from "@/features/notes/types";
import { isLocale } from "@/i18n/config";
import { resolveBoardViewer } from "../lib/boardHandler";

const MAX_KEYWORD_LENGTH = 100;
const VALID_CATEGORIES: readonly NoteTemplateCategory[] = [
  "standard",
  "seasonal",
  "sports",
];

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};

/**
 * Public discovery remains available without sign-in and publicly cacheable.
 * Personal discovery requires a valid web session or mobile Bearer token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawKeyword = searchParams.get("query")?.trim() ?? "";
  const keyword = rawKeyword ? rawKeyword.slice(0, MAX_KEYWORD_LENGTH) : undefined;

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

  const categoryParam = searchParams.get("category");
  if (categoryParam && !VALID_CATEGORIES.includes(categoryParam as NoteTemplateCategory)) {
    return NextResponse.json(
      { error: "category must be one of standard, seasonal, sports" },
      { status: 400 },
    );
  }
  const category = (categoryParam as NoteTemplateCategory | null) ?? undefined;

  const languageParam = searchParams.get("language");
  if (languageParam && !isLocale(languageParam)) {
    return NextResponse.json(
      { error: "language must be one of tr, en, de, fr, es" },
      { status: 400 },
    );
  }
  const language = languageParam && isLocale(languageParam) ? languageParam : undefined;

  if (!keyword && !from && !to && !category && !language) {
    return NextResponse.json(
      { error: "query, from, to, category, or language is required" },
      { status: 400 },
    );
  }

  const filters = { keyword, from, to, category, language };

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

    const results = await searchPublicMessages(filters, viewer.viewerId);
    return NextResponse.json({ results }, { headers: PRIVATE_HEADERS });
  }

  const results = await searchPublicMessages(filters);
  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
      },
    },
  );
}
