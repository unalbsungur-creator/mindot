import type postgres from "postgres";
import { normalizeQuoteAuthor, QUOTE_AUTHOR_MAX_LENGTH } from "./quoteAttribution";

/**
 * MB-01: the one-time attribution of the quotes already on the Wall
 * (written before "Bu söz kimin?" existed). The list is the approved table
 * from the MB-01 review — real ids from the public board, each with the
 * opening words it must still have, so a wrong database or an edited card
 * is skipped, never overwritten.
 *
 * Runs after migration 0029 (`npm run db:quotes:backfill`, src/lib/db/
 * quoteBackfill.ts): a dry run first, which prints every card before and
 * after; `--apply` writes the same plan in one transaction. Idempotent — a
 * card already in its target state is reported as unchanged.
 *
 * `sharer: "anonymous"` — the card's visible name is the quoted person (or
 * an attribution like "Mevlana", "Hamlet", "La Edri"), not the person who
 * shared it. Marking it a quote would read "— Marcus Aurelius · shared by
 * Marcus Aurelius", so the sharer becomes "anonymous": the stored name is
 * replaced by the literal "anonymous" placeholder (the same contract as an
 * anonymous submission) — never by the account's own name, which this
 * script neither reads nor prints.
 */
export interface QuoteBackfillEntry {
  id: string;
  /** The card's opening words, compared case- and punctuation-insensitively. */
  startsWith: string;
  /** `null` = "Bilinmiyor" (unknown author). */
  quoteAuthor: string | null;
  sharer: "keep" | "anonymous";
}

export const QUOTE_BACKFILL_PLAN: readonly QuoteBackfillEntry[] = [
  { id: "8d6fc355-7356-4c0b-bec5-f2b17ec9354f", startsWith: "En iyi intikam", quoteAuthor: "Marcus Aurelius", sharer: "anonymous" },
  { id: "825e6135-13a0-4b2d-be21-e51d72b32dd0", startsWith: "Knowledge itself is power", quoteAuthor: "Francis Bacon", sharer: "anonymous" },
  { id: "eba403ff-11fd-4999-99f9-94af6687fffd", startsWith: "Habe Mut", quoteAuthor: "Immanuel Kant", sharer: "anonymous" },
  { id: "c883d256-e70e-4333-98df-5be68253cba8", startsWith: "Have the courage", quoteAuthor: "Immanuel Kant", sharer: "anonymous" },
  { id: "4fdbe423-ee1f-43c1-ad4b-bcffbee8d8c0", startsWith: "Eureka", quoteAuthor: "Arşimet", sharer: "anonymous" },
  { id: "cbfe3955-c068-4d46-ae7d-a07299bf07f1", startsWith: "To be, or not to be", quoteAuthor: "William Shakespeare", sharer: "anonymous" },
  { id: "80526b51-76fa-49da-843b-182a24f92176", startsWith: "The trouble with the world", quoteAuthor: "Bertrand Russell'dan uyarlama", sharer: "anonymous" },
  { id: "2f7f78a3-f890-49cd-9d35-5a3cea06a6d7", startsWith: "The trouble with the world", quoteAuthor: "Bertrand Russell'dan uyarlama", sharer: "anonymous" },
  { id: "1cafde5a-30f2-411d-8e1e-5053fc5d0ad2", startsWith: "Hayret etmek", quoteAuthor: "Platon", sharer: "anonymous" },
  { id: "9de95726-5629-4b72-aece-aba25fc581fd", startsWith: "Ya olduğun gibi görün", quoteAuthor: "Mevlânâ'ya atfedilir", sharer: "anonymous" },
  { id: "af29f4b8-09cc-4037-a075-84688951b40c", startsWith: "Başkalarının kusurunu", quoteAuthor: "Mevlânâ'ya atfedilir", sharer: "anonymous" },
  { id: "d2dbd459-4985-4505-9135-233ce592e510", startsWith: "Cömertlik ve yardım", quoteAuthor: "Mevlânâ'ya atfedilir", sharer: "anonymous" },
  { id: "30b45b07-8654-4702-82da-35da6396a2fb", startsWith: "Yüzde ısrar etme", quoteAuthor: null, sharer: "anonymous" },
  { id: "2b2954ff-6b6d-42a8-b66a-f1bd26692edc", startsWith: "Derdini anlatacak", quoteAuthor: null, sharer: "anonymous" },
  { id: "159d9a8d-a84c-4de1-8ec7-f2a553fc049f", startsWith: "Kalite, asla tesadüf", quoteAuthor: "John Ruskin'e atfedilir", sharer: "anonymous" },
  { id: "f839676d-ca02-483f-84e4-8b4a17a760af", startsWith: "Sana yapılmasını istemediğin", quoteAuthor: "Konfüçyüs'e atfedilir", sharer: "anonymous" },
  { id: "130fce61-dc32-402c-8244-51f0fe2d3cec", startsWith: "Alles im Leben hat", quoteAuthor: "Vaiz 3:1", sharer: "anonymous" },
  { id: "e6625824-32e0-4651-94f8-a85882b0ab6a", startsWith: "Allah Allah Allah", quoteAuthor: "Taraftar tezahüratı", sharer: "anonymous" },
  { id: "3e5f34d5-b247-48c9-86e2-2774553be1f5", startsWith: "Övünmekte çok haklıyız", quoteAuthor: "Taraftar tezahüratı", sharer: "anonymous" },
  { id: "5389e4de-cbc7-4a3a-bcda-0d4f30572dec", startsWith: "Gerçekleri Tarih Yazar", quoteAuthor: "Taraftar tezahüratı", sharer: "anonymous" },
  // "Pisi pisine" (45e05473…) is NOT a quote: it is the product owner's own
  // joke (decision 2026-11-08). Never added here; the card stays untouched.
];

/** Never touched, whatever the plan says: "Merhaba Dünya" and the cards signed by the founder. */
export const QUOTE_BACKFILL_PROTECTED_IDS: readonly string[] = ["287bddad-ce94-4eca-8127-4f0d95776434"];
export const QUOTE_BACKFILL_PROTECTED_AUTHOR_NAMES: readonly string[] = ["Ünal Büyüksungur"];

export const ANONYMOUS_AUTHOR_NAME = "anonymous";

export interface QuoteBackfillRow {
  id: string;
  content: string;
  authorName: string;
  isAnonymous: boolean;
  isQuote: boolean;
  quoteAuthor: string | null;
}

export interface QuoteBackfillState {
  isQuote: boolean;
  quoteAuthor: string | null;
  isAnonymous: boolean;
  authorName: string;
}

export type QuoteBackfillDecision =
  | { id: string; action: "update"; before: QuoteBackfillState; after: QuoteBackfillState; excerpt: string }
  | { id: string; action: "unchanged"; before: QuoteBackfillState; excerpt: string }
  | { id: string; action: "skip"; reason: "missing" | "content-mismatch" | "protected"; excerpt?: string };

/** Lower-case, letters/digits/spaces only — so “quotes”, commas, case and doubled spaces don't matter. */
function comparable(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function excerptOf(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 47)}…` : oneLine;
}

/** What one plan entry does to its row — pure, so the dry run and the apply always agree. */
export function decideQuoteBackfill(row: QuoteBackfillRow | null, entry: QuoteBackfillEntry): QuoteBackfillDecision {
  if (!row) return { id: entry.id, action: "skip", reason: "missing" };
  const excerpt = excerptOf(row.content);
  if (QUOTE_BACKFILL_PROTECTED_IDS.includes(row.id) || QUOTE_BACKFILL_PROTECTED_AUTHOR_NAMES.includes(row.authorName.trim())) {
    return { id: entry.id, action: "skip", reason: "protected", excerpt };
  }
  if (!comparable(row.content).startsWith(comparable(entry.startsWith))) {
    return { id: entry.id, action: "skip", reason: "content-mismatch", excerpt };
  }
  const before: QuoteBackfillState = { isQuote: row.isQuote, quoteAuthor: row.quoteAuthor, isAnonymous: row.isAnonymous, authorName: row.authorName };
  const anonymous = entry.sharer === "anonymous" || row.isAnonymous;
  const after: QuoteBackfillState = {
    isQuote: true,
    quoteAuthor: entry.quoteAuthor === null ? null : normalizeQuoteAuthor(entry.quoteAuthor),
    isAnonymous: anonymous,
    authorName: anonymous ? ANONYMOUS_AUTHOR_NAME : row.authorName,
  };
  const same =
    before.isQuote === after.isQuote && before.quoteAuthor === after.quoteAuthor && before.isAnonymous === after.isAnonymous && before.authorName === after.authorName;
  return same ? { id: entry.id, action: "unchanged", before, excerpt } : { id: entry.id, action: "update", before, after, excerpt };
}

/** The plan's own sanity: unique ids, valid author lengths, nothing protected. Throws before any database access. */
export function assertValidQuoteBackfillPlan(plan: readonly QuoteBackfillEntry[]): void {
  const ids = new Set<string>();
  for (const entry of plan) {
    if (ids.has(entry.id)) throw new Error(`Duplicate plan id ${entry.id}`);
    ids.add(entry.id);
    if (QUOTE_BACKFILL_PROTECTED_IDS.includes(entry.id)) throw new Error(`Protected card ${entry.id} is in the plan`);
    if (entry.quoteAuthor !== null) {
      const length = [...normalizeQuoteAuthor(entry.quoteAuthor)].length;
      if (length < 1 || length > QUOTE_AUTHOR_MAX_LENGTH) throw new Error(`Quote author for ${entry.id} must be 1–${QUOTE_AUTHOR_MAX_LENGTH} characters`);
    }
  }
}

export function describeState(state: QuoteBackfillState): string {
  const words = state.isQuote ? `alıntı — ${state.quoteAuthor ?? "Bilinmiyor"}` : "kendi sözü";
  const sharer = state.isAnonymous ? "anonim" : `"${state.authorName}"`;
  return `${words} · paylaşan: ${sharer}`;
}

/**
 * Reads every planned row, decides, and — with `apply` — writes the
 * updates in one transaction (each UPDATE is also conditional on the row
 * still being in its "before" state, so a concurrent edit makes the whole
 * run roll back instead of being overwritten). Only the four attribution
 * columns are ever written; placement, status, content and moderation are
 * never touched.
 */
export async function runQuoteBackfill(
  sql: ReturnType<typeof postgres>,
  { apply, plan = QUOTE_BACKFILL_PLAN }: { apply: boolean; plan?: readonly QuoteBackfillEntry[] }
): Promise<QuoteBackfillDecision[]> {
  assertValidQuoteBackfillPlan(plan);
  const [columns] = await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name IN ('is_quote', 'quote_author')
  `;
  if (columns.n !== 2) throw new Error("messages.is_quote / quote_author are missing — run migration 0029 first. Nothing was changed.");

  const rows = await sql<{ id: string; content: string; author_name: string; is_anonymous: boolean; is_quote: boolean; quote_author: string | null }[]>`
    SELECT id, content, author_name, is_anonymous, is_quote, quote_author FROM messages WHERE id IN ${sql(plan.map((entry) => entry.id))}
  `;
  const byId = new Map(
    rows.map((row) => [row.id, { id: row.id, content: row.content, authorName: row.author_name, isAnonymous: row.is_anonymous, isQuote: row.is_quote, quoteAuthor: row.quote_author }])
  );
  const decisions = plan.map((entry) => decideQuoteBackfill(byId.get(entry.id) ?? null, entry));
  if (!apply) return decisions;

  await sql.begin(async (tx) => {
    for (const decision of decisions) {
      if (decision.action !== "update") continue;
      const { before, after } = decision;
      const updated = await tx`
        UPDATE messages
        SET is_quote = ${after.isQuote}, quote_author = ${after.quoteAuthor}, is_anonymous = ${after.isAnonymous}, author_name = ${after.authorName}
        WHERE id = ${decision.id}
          AND is_quote = ${before.isQuote} AND quote_author IS NOT DISTINCT FROM ${before.quoteAuthor}
          AND is_anonymous = ${before.isAnonymous} AND author_name = ${before.authorName}
      `;
      if (updated.count !== 1) throw new Error(`Card ${decision.id} changed while the backfill ran — rolled back, nothing was written.`);
    }
  });
  return decisions;
}
