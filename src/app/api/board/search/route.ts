import { NextResponse, type NextRequest } from "next/server";
import { searchPublicMessages } from "@/features/board/repository";
import type { NoteTemplateCategory } from "@/features/notes/types";
import { isLocale } from "@/i18n/config";

const MAX_KEYWORD_LENGTH = 100;
/** EPIC "Paylaşılan Kartlarda Gelişmiş Filtreleme": the only three real `NoteTemplateCategory` values — "all" is the UI's own "no restriction" choice and is never sent as a query param at all (see BoardDiscoveryPanel), so it's deliberately not in this list. */
const VALID_CATEGORIES: readonly NoteTemplateCategory[] = ["standard", "seasonal", "sports"];

/**
 * EPIC 021: board discovery's only endpoint. Public, no sign-in required
 * — same policy as `/api/board`, since the underlying data is the same
 * already-public, approved-only board content; the only thing new here is
 * the query shape (keyword/date, not tileX/tileY). Deliberately refuses a
 * request with no filter at all (400) rather than treating it as "return
 * the most recent N approved messages" — see `searchPublicMessages`'s own
 * doc comment for why that boundary matters.
 *
 * EPIC "Paylaşılan Kartlarda Gelişmiş Filtreleme": `?category=` is the
 * one new, optional query param — `standard`/`seasonal`/`sports` (never
 * `"all"`; the UI simply omits this param for "no category restriction",
 * same convention `query`/`from`/`to` already use for "not set"). Counts
 * toward the "at least one filter" requirement exactly like the others.
 *
 * EPIC — Duvar Filtreleme: Dil Tercihi — `?language=` is a fourth,
 * optional query param, one of the five `Locale` codes (`isLocale`, the
 * same guard `src/i18n/config.ts` already exports and the rest of the app
 * already uses) — never `"all"`, same "UI omits it for no restriction"
 * convention as `category`. Counts toward the "at least one filter"
 * requirement exactly like the others.
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

  const categoryParam = searchParams.get("category");
  if (categoryParam && !VALID_CATEGORIES.includes(categoryParam as NoteTemplateCategory)) {
    return NextResponse.json({ error: "category must be one of standard, seasonal, sports" }, { status: 400 });
  }
  const category = (categoryParam as NoteTemplateCategory | null) ?? undefined;

  const languageParam = searchParams.get("language");
  if (languageParam && !isLocale(languageParam)) {
    return NextResponse.json({ error: "language must be one of tr, en, de, fr, es" }, { status: 400 });
  }
  const language = languageParam && isLocale(languageParam) ? languageParam : undefined;

  if (!keyword && !from && !to && !category && !language) {
    return NextResponse.json({ error: "query, from, to, category, or language is required" }, { status: 400 });
  }

  const results = await searchPublicMessages({ keyword, from, to, category, language });
  return NextResponse.json(
    { results },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } }
  );
}
