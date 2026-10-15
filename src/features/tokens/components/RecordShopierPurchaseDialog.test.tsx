import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "@/features/users/types";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import { packageOptionLabel, type TokenPackageOption } from "../lib/shopierPurchaseForm";

// Static markup of the admin "Record Shopier purchase" dialog and the
// /admin/users list around it. The server actions are stubbed: rendering
// must never call them. Interaction (submit, results) is covered through
// lib/shopierPurchaseForm.ts in shopierPurchases.test.ts. Run with module mocks:
//   npx tsx --experimental-test-module-mocks --test src/features/tokens/components/RecordShopierPurchaseDialog.test.tsx

const PACKAGES: TokenPackageOption[] = [
  { id: "tokens-10", tokens: 10, priceTry: 12 },
  { id: "tokens-50", tokens: 50, priceTry: 50 },
  { id: "tokens-100", tokens: 100, priceTry: 80 },
];

const actionCalls: string[] = [];

let RecordShopierPurchaseDialog: typeof import("./RecordShopierPurchaseDialog").RecordShopierPurchaseDialog;
let UsersPageContent: typeof import("@/app/admin/users/_components/UsersPageContent").UsersPageContent;

before(async () => {
  mock.module("@/features/tokens/admin-actions", {
    namedExports: {
      recordShopierPurchase: async () => (actionCalls.push("recordShopierPurchase"), { ok: false, error: "failed" }),
      grantTokens: async () => (actionCalls.push("grantTokens"), { ok: false, error: "conflict" }),
    },
  });
  mock.module("@/features/users/moderation-actions", {
    namedExports: {
      suspendUser: async () => (actionCalls.push("suspendUser"), { ok: false }),
      unsuspendUser: async () => (actionCalls.push("unsuspendUser"), { ok: false }),
    },
  });
  mock.module("next/navigation", { namedExports: { useSearchParams: () => new URLSearchParams() } });
  ({ RecordShopierPurchaseDialog } = await import("./RecordShopierPurchaseDialog"));
  ({ UsersPageContent, matchesUserSearch } = await import("@/app/admin/users/_components/UsersPageContent"));
});

let matchesUserSearch: typeof import("@/app/admin/users/_components/UsersPageContent").matchesUserSearch;

const t = getDictionary(defaultLocale).usersAdmin;
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function renderDialog() {
  return renderToStaticMarkup(
    <LocaleProvider>
      <RecordShopierPurchaseDialog
        open={false}
        userId="user-1"
        userLabel="Ayşe"
        accountEmail="ayse@example.test"
        packages={PACKAGES}
        userLabelFor={() => null}
        onClose={() => {}}
        onRecorded={() => {}}
      />
    </LocaleProvider>
  );
}

const makeUser = (fields: Partial<User>): User =>
  ({
    id: "user-1",
    email: "ayse@example.test",
    name: "Ayşe",
    image: null,
    role: "user",
    publicId: null,
    publicWallEnabled: false,
    publicWallDescription: null,
    publicWallConsentVersion: null,
    publicWallConsentAt: null,
    status: "active",
    statusReason: null,
    statusChangedAt: null,
    statusChangedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  }) as User;

const counts = { total: 0, pending: 0, approved: 0, rejected: 0, archived: 0 };

describe("RecordShopierPurchaseDialog markup", () => {
  it("shows the title, the account it records for and its email", () => {
    const html = renderDialog();
    assert.ok(html.includes(escapeHtml(t.recordPurchaseTitle)));
    assert.ok(html.includes(escapeHtml(t.recordPurchaseBody.replace("{name}", "Ayşe"))));
    assert.ok(html.includes(escapeHtml(t.recordPurchaseAccountEmail.replace("{email}", "ayse@example.test"))));
  });

  it("offers exactly the three packages, labelled with their Tokens and price — and no amount or price field", () => {
    const html = renderDialog();
    const options = [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(
      options,
      PACKAGES.map((pkg) => [pkg.id, escapeHtml(packageOptionLabel(t, pkg, defaultLocale))])
    );
    assert.doesNotMatch(html, /type="number"/);
    assert.doesNotMatch(html, /name="(amount|tokens|price)/);
  });

  it("requires the order number and the buyer email, with their hints", () => {
    const html = renderDialog();
    for (const text of [t.recordPurchaseOrderLabel, t.recordPurchaseOrderHint, t.recordPurchaseBuyerEmailLabel, t.recordPurchaseBuyerEmailHint]) {
      assert.ok(html.includes(escapeHtml(text)), text);
    }
    assert.match(html, /<input[^>]*type="text"[^>]*required=""/);
    assert.match(html, /<input[^>]*type="email"[^>]*required=""/);
  });

  it("offers manual review as an unticked choice, and asks for its reason only once it is ticked", () => {
    const html = renderDialog();
    assert.ok(html.includes(escapeHtml(t.recordPurchaseManualReviewLabel)));
    assert.ok(html.includes(escapeHtml(t.recordPurchaseManualReviewHint)));
    assert.match(html, /<input[^>]*type="checkbox"/);
    assert.doesNotMatch(html, /type="checkbox"[^>]*checked/);
    assert.ok(!html.includes(escapeHtml(t.recordPurchaseReasonLabel)), "the reason field is hidden until manual review is ticked");
  });

  it("has an optional note, Cancel and a submit button, and calls no action while rendering", () => {
    const html = renderDialog();
    assert.ok(html.includes(escapeHtml(t.recordPurchaseNoteLabel)));
    assert.ok(html.includes(`>${escapeHtml(t.recordPurchaseCancel)}<`));
    assert.match(html, new RegExp(`<button[^>]*type="submit"[^>]*>${escapeHtml(t.recordPurchaseConfirm)}</button>`));
    assert.deepEqual(actionCalls, []);
  });
});

describe("/admin/users with the Shopier purchase action", () => {
  function renderPage() {
    return renderToStaticMarkup(
      <LocaleProvider>
        <UsersPageContent
          authorized
          currentUserId="admin-1"
          tokenPackages={PACKAGES}
          items={[
            { user: makeUser({}), messageCounts: counts, tokenBalance: 3 },
            { user: makeUser({ id: "user-2", email: "mehmet@example.test", name: "Mehmet" }), messageCounts: counts, tokenBalance: 0 },
          ]}
        />
      </LocaleProvider>
    );
  }

  it("has a search box for email or name", () => {
    const html = renderPage();
    assert.ok(html.includes(escapeHtml(t.searchLabel)));
    assert.match(html, new RegExp(`<input[^>]*type="search"[^>]*placeholder="${escapeHtml(t.searchPlaceholder)}"`));
    assert.ok(!html.includes(escapeHtml(t.searchNoResults)), "no 'no results' notice without a search");
  });

  it("offers the Shopier purchase next to — not instead of — Grant Tokens on every row", () => {
    const html = renderPage();
    // Buttons only: each row also renders its (closed) dialogs, whose titles can read the same.
    const buttons = (text: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].filter((m) => m[1] === escapeHtml(text)).length;
    assert.equal(buttons(t.recordPurchaseAction), 2);
    assert.equal(buttons(t.grantTokensAction), 2);
    assert.deepEqual(actionCalls, []);
  });
});

// The /admin/users search filter: Turkish I/İ/ı/i fold together, accents and case don't matter.
describe("matchesUserSearch", () => {
  const user = (name: string | null, email = "someone@example.test") => ({ name, email });

  it("matches the Turkish I family whatever the case or dot", () => {
    assert.ok(matchesUserSearch(user("İsmail Kaya"), "ismail"));
    assert.ok(matchesUserSearch(user("Ismail"), "ismail"));
    assert.ok(matchesUserSearch(user(null, "Info@Example.com"), "info"));
    assert.ok(matchesUserSearch(user("IŞIL"), "isil"));
    assert.ok(matchesUserSearch(user("ışıl"), "ISIL"));
    assert.ok(matchesUserSearch(user("Irmak"), "ırmak"));
    assert.ok(matchesUserSearch(user("ismail"), "İSMAİL"));
  });

  it("keeps matching names and emails without Turkish characters, and other accents", () => {
    assert.ok(matchesUserSearch(user("John Smith"), "smith"));
    assert.ok(matchesUserSearch(user(null, "john.smith@example.com"), "JOHN.SMITH@"));
    assert.ok(matchesUserSearch(user("Ayşe Çelik"), "ayse celik"));
    assert.ok(matchesUserSearch(user("Gökhan Öztürk"), "OZTURK"));
    assert.ok(matchesUserSearch(user("Zoë Müller"), "zoe muller"));
  });

  it("matches a part of the email or the name, and nothing that isn't there", () => {
    assert.ok(matchesUserSearch(user("Mehmet Demir", "mehmet@example.test"), "emi"));
    assert.ok(matchesUserSearch(user("Mehmet Demir", "mehmet@example.test"), "example.te"));
    assert.ok(!matchesUserSearch(user("Mehmet Demir", "mehmet@example.test"), "ayşe"));
    assert.ok(!matchesUserSearch(user(null, "mehmet@example.test"), "demir"), "a missing name never matches");
  });

  it("treats an empty or blank search as matching everyone", () => {
    for (const query of ["", "   ", "\t"]) assert.ok(matchesUserSearch(user("Anyone"), query), JSON.stringify(query));
    assert.ok(matchesUserSearch(user(null), "  "));
  });

  it("trims the search but keeps inner spaces significant", () => {
    assert.ok(matchesUserSearch(user("İsmail Kaya"), "  ismail kaya  "));
    assert.ok(!matchesUserSearch(user("İsmail Kaya"), "ismailkaya"));
  });
});
