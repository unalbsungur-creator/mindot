import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/translations";
import {
  EMPTY_SHOPIER_PURCHASE_FORM,
  buildShopierPurchasePayload,
  formatTryPrice,
  packageOptionLabel,
  shopierPurchaseFormErrorMessage,
  shopierPurchaseOutcome,
  validateShopierPurchaseForm,
  type ShopierPurchaseFormError,
  type ShopierPurchaseFormValues,
} from "./lib/shopierPurchaseForm";
import type { CreditShopierPurchaseResult } from "./repository";
import {
  recordShopierPurchaseForAdmin,
  type RecordShopierPurchaseDeps,
  type RecordShopierPurchaseInput,
  type RecordShopierPurchaseResult,
} from "./shopierPurchases";
import type { TokenLedgerEntry } from "./types";

// Database-free: the admin gate, input checks and result mapping. The
// transaction itself (amounts, duplicates, emails, concurrency) runs against
// PostgreSQL in repository.db.test.ts (npm run test:db:tokens).

function entry(overrides: Partial<TokenLedgerEntry> = {}): TokenLedgerEntry {
  return {
    id: "entry-1",
    userId: "user-1",
    amount: 50,
    type: "purchase",
    balanceAfter: 50,
    referenceType: "shopier_order",
    referenceId: "tokens-50",
    idempotencyKey: "shopier_order:AB-12",
    externalProvider: "shopier",
    externalReference: "AB-12",
    createdBy: "admin-1",
    note: "email: matched",
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

const INPUT: RecordShopierPurchaseInput = {
  userId: "user-1",
  packageId: "tokens-50",
  orderRef: " ab-12 ",
  buyerEmail: "Buyer@Example.com",
};

function setup(
  options: {
    admin?: { id: string } | null;
    session?: boolean;
    active?: boolean;
    result?: CreditShopierPurchaseResult | Error;
  } = {}
) {
  const calls = { credit: [] as Parameters<RecordShopierPurchaseDeps["credit"]>[0][], active: [] as string[], revalidate: 0 };
  const deps: RecordShopierPurchaseDeps = {
    requireAdmin: async () => (options.admin === undefined ? { id: "admin-1" } : options.admin),
    hasSession: async () => options.session ?? true,
    isActiveAccount: async (userId) => {
      calls.active.push(userId);
      return options.active ?? true;
    },
    credit: async (input) => {
      calls.credit.push(input);
      const result: CreditShopierPurchaseResult | Error = options.result ?? {
        status: "credited",
        entry: entry(),
        balance: 50,
        emailCheck: "matched",
      };
      if (result instanceof Error) throw result;
      return result;
    },
    revalidate: () => {
      calls.revalidate += 1;
    },
  };
  return { deps, calls };
}

describe("recordShopierPurchaseForAdmin", () => {
  let errorLog: ReturnType<typeof mock.method>;
  beforeEach(() => {
    errorLog = mock.method(console, "error", () => {});
  });
  afterEach(() => {
    errorLog.mock.restore();
  });

  it("requires an admin session, and never reaches the account check or the repository without one", async () => {
    const noSession = setup({ admin: null, session: false });
    assert.deepEqual(await recordShopierPurchaseForAdmin(INPUT, noSession.deps), { ok: false, error: "auth-required" });
    const notAdmin = setup({ admin: null, session: true });
    assert.deepEqual(await recordShopierPurchaseForAdmin(INPUT, notAdmin.deps), { ok: false, error: "forbidden" });
    for (const { calls } of [noSession, notAdmin]) {
      assert.deepEqual(calls.credit, []);
      assert.deepEqual(calls.active, []);
      assert.equal(calls.revalidate, 0);
    }
  });

  it("credits through the repository with the session's admin and the submitted values — never an amount", async () => {
    const { deps, calls } = setup();
    const result = await recordShopierPurchaseForAdmin(
      { ...INPUT, note: "  paid  ", tokens: 5000, amount: 5000, priceTry: 0, adminId: "someone-else" } as RecordShopierPurchaseInput,
      deps
    );

    assert.deepEqual(result, {
      ok: true,
      data: { status: "credited", packageId: "tokens-50", tokens: 50, balance: 50, ledgerEntryId: "entry-1", emailCheck: "matched" },
    });
    assert.deepEqual(calls.credit, [
      {
        userId: "user-1",
        adminId: "admin-1",
        packageId: "tokens-50",
        orderRef: " ab-12 ",
        buyerEmail: "Buyer@Example.com",
        manualReviewReason: null,
        note: "  paid  ",
      },
    ]);
    assert.deepEqual(calls.active, ["user-1"]);
    assert.equal(calls.revalidate, 1);
  });

  it("refuses bad input before touching the database", async () => {
    const cases: [Partial<Record<keyof RecordShopierPurchaseInput, unknown>>, string][] = [
      [{ userId: "" }, "target-user-not-found"],
      [{ userId: 42 }, "target-user-not-found"],
      [{ packageId: "tokens-25" }, "invalid-package"],
      [{ packageId: "TOKENS-50" }, "invalid-package"],
      [{ packageId: undefined }, "invalid-package"],
      [{ orderRef: "" }, "invalid-order"],
      [{ orderRef: "  " }, "invalid-order"],
      [{ orderRef: undefined }, "invalid-order"],
      [{ orderRef: "12/34" }, "invalid-order"],
      [{ buyerEmail: "" }, "invalid-email"],
      [{ buyerEmail: "buyer" }, "invalid-email"],
      [{ buyerEmail: undefined }, "invalid-email"],
    ];
    for (const [override, error] of cases) {
      const { deps, calls } = setup();
      const result = await recordShopierPurchaseForAdmin({ ...INPUT, ...override } as RecordShopierPurchaseInput, deps);
      assert.deepEqual(result, { ok: false, error }, JSON.stringify(override));
      assert.deepEqual(calls.credit, [], JSON.stringify(override));
      assert.deepEqual(calls.active, [], JSON.stringify(override));
    }
    const { deps, calls } = setup();
    assert.deepEqual(await recordShopierPurchaseForAdmin(null as unknown as RecordShopierPurchaseInput, deps), {
      ok: false,
      error: "target-user-not-found",
    });
    assert.deepEqual(calls.credit, []);
  });

  it("requires a reason when manual review is ticked, and passes no reason unless it is", async () => {
    for (const manualReviewReason of [undefined, "", "   \n"]) {
      const { deps, calls } = setup();
      assert.deepEqual(await recordShopierPurchaseForAdmin({ ...INPUT, manualReview: true, manualReviewReason }, deps), {
        ok: false,
        error: "manual-review-reason-required",
      });
      assert.deepEqual(calls.credit, []);
    }

    const ticked = setup();
    await recordShopierPurchaseForAdmin({ ...INPUT, manualReview: true, manualReviewReason: "  checked by phone  " }, ticked.deps);
    assert.equal(ticked.calls.credit[0].manualReviewReason, "checked by phone");

    // A reason without the explicit choice is ignored — differing emails then stay a mismatch.
    for (const manualReview of [undefined, false, "true" as unknown as boolean]) {
      const unticked = setup();
      await recordShopierPurchaseForAdmin({ ...INPUT, manualReview, manualReviewReason: "checked" }, unticked.deps);
      assert.equal(unticked.calls.credit[0].manualReviewReason, null, String(manualReview));
    }
  });

  it("refuses a deleted or unknown account without reaching the repository", async () => {
    const { deps, calls } = setup({ active: false });
    assert.deepEqual(await recordShopierPurchaseForAdmin(INPUT, deps), { ok: false, error: "target-user-not-found" });
    assert.deepEqual(calls.credit, []);
    assert.equal(calls.revalidate, 0);
  });

  it("maps every repository outcome to a typed result, revalidating only after a new credit", async () => {
    const existing = {
      entryId: "entry-0",
      userId: "user-2",
      packageId: "tokens-10",
      amount: 10,
      createdAt: new Date(0).toISOString(),
      createdBy: "admin-2",
    };
    const cases: [CreditShopierPurchaseResult, unknown][] = [
      [
        { status: "already_recorded", entry: entry(), balance: 70 },
        { ok: true, data: { status: "already_recorded", packageId: "tokens-50", tokens: 50, balance: 70, ledgerEntryId: "entry-1" } },
      ],
      [{ status: "order_already_used", existing }, { ok: false, error: "order-already-used", existingOrder: existing }],
      [{ status: "email_mismatch" }, { ok: false, error: "email-mismatch" }],
      [{ status: "invalid_package" }, { ok: false, error: "invalid-package" }],
      [{ status: "invalid_order" }, { ok: false, error: "invalid-order" }],
      [{ status: "invalid_email" }, { ok: false, error: "invalid-email" }],
      [{ status: "ineligible" }, { ok: false, error: "target-user-not-found" }],
      [{ status: "conflict" }, { ok: false, error: "conflict" }],
    ];
    for (const [result, expected] of cases) {
      const { deps, calls } = setup({ result });
      assert.deepEqual(await recordShopierPurchaseForAdmin(INPUT, deps), expected, result.status);
      assert.equal(calls.revalidate, 0, result.status);
    }

    const manual = setup({ result: { status: "credited", entry: entry(), balance: 50, emailCheck: "manual_review" } });
    const credited = await recordShopierPurchaseForAdmin({ ...INPUT, manualReview: true, manualReviewReason: "checked" }, manual.deps);
    assert.equal(credited.ok && credited.data.emailCheck, "manual_review");
    assert.equal(manual.calls.revalidate, 1);
  });

  it("reports a repository failure as `failed`, logging only the error's name", async () => {
    const { deps, calls } = setup({ result: new TypeError("buyer@example.com could not be written") });
    assert.deepEqual(await recordShopierPurchaseForAdmin(INPUT, deps), { ok: false, error: "failed" });
    assert.equal(calls.revalidate, 0);
    assert.equal(errorLog.mock.callCount(), 1);
    assert.deepEqual(errorLog.mock.calls[0].arguments, ["[shopier-purchase] credit failed", "TypeError"]);
  });
});

// The admin dialog's own logic (lib/shopierPurchaseForm.ts), against every real dictionary.
describe("Shopier purchase form", () => {
  const PACKAGE_IDS = ["tokens-10", "tokens-50", "tokens-100"];
  const FILLED: ShopierPurchaseFormValues = {
    ...EMPTY_SHOPIER_PURCHASE_FORM,
    packageId: "tokens-50",
    orderRef: "AB-12",
    buyerEmail: "buyer@example.com",
  };

  it("checks a form the same way the action does, before any request", () => {
    assert.equal(validateShopierPurchaseForm(FILLED, PACKAGE_IDS), null);
    const cases: [Partial<ShopierPurchaseFormValues>, ShopierPurchaseFormError][] = [
      [{ packageId: "" }, "invalid-package"],
      [{ packageId: "tokens-25" }, "invalid-package"],
      [{ orderRef: "" }, "invalid-order"],
      [{ orderRef: "a b" }, "invalid-order"],
      [{ buyerEmail: "" }, "invalid-email"],
      [{ buyerEmail: "buyer" }, "invalid-email"],
      [{ manualReview: true, manualReviewReason: "  " }, "manual-review-reason-required"],
    ];
    for (const [override, expected] of cases) {
      assert.equal(validateShopierPurchaseForm({ ...FILLED, ...override }, PACKAGE_IDS), expected, JSON.stringify(override));
    }
    assert.equal(validateShopierPurchaseForm({ ...FILLED, manualReview: true, manualReviewReason: "checked" }, PACKAGE_IDS), null);
    // A reason without the explicit choice isn't a manual review — the server decides on the emails.
    assert.equal(validateShopierPurchaseForm({ ...FILLED, manualReviewReason: "checked" }, PACKAGE_IDS), null);
  });

  it("sends only what the action needs — never an amount, a price or an admin id", () => {
    assert.deepEqual(buildShopierPurchasePayload("user-1", FILLED), {
      userId: "user-1",
      packageId: "tokens-50",
      orderRef: "AB-12",
      buyerEmail: "buyer@example.com",
    });
    assert.deepEqual(
      buildShopierPurchasePayload("user-1", { ...FILLED, manualReview: true, manualReviewReason: "checked", note: "paid" }),
      {
        userId: "user-1",
        packageId: "tokens-50",
        orderRef: "AB-12",
        buyerEmail: "buyer@example.com",
        manualReview: true,
        manualReviewReason: "checked",
        note: "paid",
      }
    );
    // An unticked review drops its reason; a blank note isn't sent.
    const payload = buildShopierPurchasePayload("user-1", { ...FILLED, manualReviewReason: "checked", note: "   " });
    assert.deepEqual(Object.keys(payload).sort(), ["buyerEmail", "orderRef", "packageId", "userId"]);
  });

  it("labels each package with its Tokens and its price in every language", () => {
    for (const locale of locales) {
      const t = getDictionary(locale).usersAdmin;
      const label = packageOptionLabel(t, { id: "tokens-100", tokens: 100, priceTry: 80 }, locale);
      assert.ok(label.includes("100"), `${locale}: ${label}`);
      assert.ok(label.includes("80"), `${locale}: ${label}`);
      assert.ok(!label.includes("{"), `${locale}: ${label}`);
      assert.ok(/₺|TRY|TL/.test(formatTryPrice(12, locale)), `${locale}: ${formatTryPrice(12, locale)}`);
    }
  });

  it("gives every action result its own message in every language, never repeating the buyer email", () => {
    const existingOrder = {
      entryId: "entry-0",
      userId: "user-2",
      packageId: "tokens-10",
      amount: 10,
      createdAt: "2026-10-15T09:00:00.000Z",
      createdBy: "admin-1",
    };
    const data = { packageId: "tokens-50" as const, tokens: 50, balance: 70, ledgerEntryId: "entry-1" };
    const results: [string, RecordShopierPurchaseResult][] = [
      ["credited", { ok: true, data: { ...data, status: "credited", emailCheck: "matched" } }],
      ["credited-manual", { ok: true, data: { ...data, status: "credited", emailCheck: "manual_review" } }],
      ["already_recorded", { ok: true, data: { ...data, status: "already_recorded" } }],
      ["order-already-used", { ok: false, error: "order-already-used", existingOrder }],
      ["email-mismatch", { ok: false, error: "email-mismatch" }],
      ["manual-review-reason-required", { ok: false, error: "manual-review-reason-required" }],
      ["invalid-package", { ok: false, error: "invalid-package" }],
      ["invalid-order", { ok: false, error: "invalid-order" }],
      ["invalid-email", { ok: false, error: "invalid-email" }],
      ["target-user-not-found", { ok: false, error: "target-user-not-found" }],
      ["conflict", { ok: false, error: "conflict" }],
      ["unauthorized", { ok: false, error: "forbidden" }],
      ["failed", { ok: false, error: "failed" }],
    ];
    for (const locale of locales) {
      const dictionary = getDictionary(locale);
      const ctx = {
        t: dictionary.usersAdmin,
        deletedAccountLabel: dictionary.tokenHistoryAdmin.deletedAccount,
        locale,
        userLabelFor: (id: string) => (id === "user-2" ? "Ayşe" : null),
      };
      const messages = new Map<string, string>();
      for (const [name, result] of results) {
        const outcome = shopierPurchaseOutcome(result, ctx);
        assert.equal(outcome.kind, result.ok ? "success" : "error", `${locale}/${name}`);
        assert.ok(outcome.message.trim(), `${locale}/${name}`);
        assert.ok(!/\{\w+\}/.test(outcome.message), `${locale}/${name}: unreplaced placeholder in "${outcome.message}"`);
        assert.ok(!outcome.message.includes("@"), `${locale}/${name}`);
        if (outcome.kind === "success") assert.equal(outcome.balance, 70);
        messages.set(name, outcome.message);
      }
      assert.equal(new Set(messages.values()).size, results.length, `${locale}: two results share a message`);
      assert.equal(
        shopierPurchaseOutcome({ ok: false, error: "auth-required" }, ctx).message,
        messages.get("unauthorized"),
        `${locale}: auth-required and forbidden read the same`
      );
      assert.ok(messages.get("order-already-used")!.includes("Ayşe"), locale);
      assert.ok(messages.get("credited")!.includes("50") && messages.get("credited")!.includes("70"), locale);

      // An order held by an account the page doesn't list (a deleted account's tombstone).
      const tombstone = shopierPurchaseOutcome({ ok: false, error: "order-already-used", existingOrder: { ...existingOrder, userId: "deleted_x" } }, ctx);
      assert.ok(tombstone.message.includes(dictionary.tokenHistoryAdmin.deletedAccount), locale);
      assert.ok(!tombstone.message.includes("deleted_x"), locale);

      for (const error of ["invalid-package", "invalid-order", "invalid-email", "manual-review-reason-required"] as const) {
        assert.equal(shopierPurchaseFormErrorMessage(ctx.t, error), messages.get(error), `${locale}/${error}`);
      }
    }
  });
});
