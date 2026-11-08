import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertValidQuoteBackfillPlan,
  decideQuoteBackfill,
  QUOTE_BACKFILL_PLAN,
  type QuoteBackfillEntry,
  type QuoteBackfillRow,
} from "./quoteBackfill";

const entry: QuoteBackfillEntry = { id: "8d6fc355-7356-4c0b-bec5-f2b17ec9354f", startsWith: "En iyi intikam", quoteAuthor: "Marcus Aurelius", sharer: "anonymous" };
const row = (overrides: Partial<QuoteBackfillRow> = {}): QuoteBackfillRow => ({
  id: entry.id,
  content: "“En iyi intikam, sana zarar verene benzememektir.”",
  authorName: "Marcus Aurelius",
  isAnonymous: false,
  isQuote: false,
  quoteAuthor: null,
  ...overrides,
});

describe("QUOTE_BACKFILL_PLAN", () => {
  it("is valid: unique ids, authors within 80 characters, nothing protected", () => {
    assert.doesNotThrow(() => assertValidQuoteBackfillPlan(QUOTE_BACKFILL_PLAN));
    assert.equal(QUOTE_BACKFILL_PLAN.length, 20);
  });

  it("leaves “Merhaba Dünya” and the founder-signed “Pisi pisine” out", () => {
    const ids = QUOTE_BACKFILL_PLAN.map((e) => e.id);
    assert.ok(!ids.includes("287bddad-ce94-4eca-8127-4f0d95776434"));
    assert.ok(!ids.some((id) => id.startsWith("45e05473")));
  });

  it("refuses a plan that names a protected card", () => {
    assert.throws(() => assertValidQuoteBackfillPlan([{ ...entry, id: "287bddad-ce94-4eca-8127-4f0d95776434" }]), /Protected/);
  });

  it("uses the agreed wording", () => {
    const authors = new Set(QUOTE_BACKFILL_PLAN.map((e) => e.quoteAuthor));
    for (const expected of ["Bertrand Russell'dan uyarlama", "Platon", "Mevlânâ'ya atfedilir", "John Ruskin'e atfedilir", "Konfüçyüs'e atfedilir", "Vaiz 3:1", "Taraftar tezahüratı", null]) {
      assert.ok(authors.has(expected), String(expected));
    }
  });
});

describe("decideQuoteBackfill", () => {
  it("marks the quote and makes a sharer named after the quoted person anonymous", () => {
    const decision = decideQuoteBackfill(row(), entry);
    assert.equal(decision.action, "update");
    assert.deepEqual(decision.action === "update" && decision.after, { isQuote: true, quoteAuthor: "Marcus Aurelius", isAnonymous: true, authorName: "anonymous" });
  });

  it("never puts any name in place of the stored one — only the literal placeholder", () => {
    const decision = decideQuoteBackfill(row({ authorName: "Someone Else" }), entry);
    assert.equal(decision.action === "update" && decision.after.authorName, "anonymous");
  });

  it("keeps a named sharer when the plan says so", () => {
    const decision = decideQuoteBackfill(row({ authorName: "A Sharer" }), { ...entry, sharer: "keep" });
    assert.deepEqual(decision.action === "update" && decision.after, { isQuote: true, quoteAuthor: "Marcus Aurelius", isAnonymous: false, authorName: "A Sharer" });
  });

  it("stores “Bilinmiyor” as a quote with no author", () => {
    const decision = decideQuoteBackfill(row(), { ...entry, quoteAuthor: null });
    assert.equal(decision.action === "update" && decision.after.quoteAuthor, null);
  });

  it("is idempotent: the target state is reported unchanged", () => {
    const done = row({ isQuote: true, quoteAuthor: "Marcus Aurelius", isAnonymous: true, authorName: "anonymous" });
    assert.equal(decideQuoteBackfill(done, entry).action, "unchanged");
  });

  it("matches the opening words regardless of quotes, punctuation and case", () => {
    assert.equal(decideQuoteBackfill(row({ content: "en İYİ   intikam — sana…" }), entry).action, "update");
  });

  it("skips a missing card, an edited card and a protected one — never writes them", () => {
    assert.deepEqual(decideQuoteBackfill(null, entry), { id: entry.id, action: "skip", reason: "missing" });
    assert.equal(decideQuoteBackfill(row({ content: "Bambaşka bir metin" }), entry).action, "skip");
    const founder = decideQuoteBackfill(row({ authorName: "Ünal Büyüksungur" }), entry);
    assert.equal(founder.action === "skip" && founder.reason, "protected");
  });
});
