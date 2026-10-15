import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it, mock } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { User } from "@/features/users/types";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";

// /tokens against stubbed session and repositories (no database, no
// network). What matters is what reaches the client: a guest never gets a
// Shopier link, a signed-in account gets only the links shopierProductUrl
// accepted, and the page is noindex. Run with module mocks:
//   npx tsx --experimental-test-module-mocks --test src/app/tokens/page.test.tsx

const VARIABLES = ["SHOPIER_TOKEN_10_URL", "SHOPIER_TOKEN_50_URL", "SHOPIER_TOKEN_100_URL"] as const;
// Placeholder product paths — test data only, not the real listings.
const VALID_10 = "https://www.shopier.com/example-shop/10000001";
const VALID_100 = "https://www.shopier.com/example-shop/10000003";
const INVALID_50 = "http://www.shopier.com/example-shop/10000002";

let session: { user: { id: string } } | null;
let account: User | null;
const repositoryCalls: string[] = [];

let TokensPage: typeof import("./page").default;
let pageModule: typeof import("./page");

before(async () => {
  mock.module("@/features/auth/auth", { namedExports: { auth: async () => session } });
  mock.module("@/features/auth/actions", {
    namedExports: { signInWithGoogle: async () => {}, signInWithApple: async () => {}, signOutAction: async () => {} },
  });
  mock.module("@/features/users/repository", {
    namedExports: {
      userRepository: { getById: async (id: string) => (repositoryCalls.push(`user:${id}`), account && account.id === id ? account : null) },
    },
  });
  mock.module("@/features/tokens/repository", {
    namedExports: { tokenRepository: { getBalance: async (id: string) => (repositoryCalls.push(`balance:${id}`), 7) } },
  });
  // For the header and homepage entry points below: no router, no session fetch (effects don't run in a static render).
  mock.module("next/navigation", { namedExports: { usePathname: () => "/", useSearchParams: () => new URLSearchParams() } });
  mock.module("@/features/notifications/actions", {
    namedExports: { markAllNotificationsAsRead: async () => ({ ok: true }), markNotificationAsRead: async () => ({ ok: true }) },
  });
  mock.module("next/image", {
    // eslint-disable-next-line @next/next/no-img-element -- test stub for next/image
    defaultExport: ({ src, alt }: { src: string | { src: string }; alt: string }) => <img src={typeof src === "string" ? src : src.src} alt={alt} />,
  });
  pageModule = await import("./page");
  TokensPage = pageModule.default;
  ({ SiteHeader } = await import("@/components/layout/SiteHeader"));
  ({ HomeHero } = await import("@/app/_home/HomeHero"));
});

let SiteHeader: typeof import("@/components/layout/SiteHeader").SiteHeader;
let HomeHero: typeof import("@/app/_home/HomeHero").HomeHero;

const saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
beforeEach(() => {
  process.env.SHOPIER_TOKEN_10_URL = VALID_10;
  process.env.SHOPIER_TOKEN_50_URL = INVALID_50;
  process.env.SHOPIER_TOKEN_100_URL = VALID_100;
  session = null;
  account = null;
  repositoryCalls.length = 0;
});
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const t = getDictionary(defaultLocale).tokenPurchase;
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

async function render(): Promise<string> {
  return renderToStaticMarkup(<LocaleProvider>{await TokensPage()}</LocaleProvider>);
}

const signedIn = () => {
  session = { user: { id: "user-1" } };
  account = { id: "user-1", email: "ayse@example.test", name: "Ayşe" } as User;
};

describe("/tokens", () => {
  it("is noindex and rendered per request", () => {
    assert.deepEqual(pageModule.metadata?.robots, { index: false, follow: false });
    assert.equal(pageModule.dynamic, "force-dynamic");
  });

  it("shows a guest all three packages and prices, asks them to sign in, and sends no Shopier link at all", async () => {
    const html = await render();
    for (const count of [10, 50, 100]) assert.ok(html.includes(escapeHtml(t.packageTokens.replace("{count}", String(count)))), String(count));
    for (const price of ["12", "50", "80"]) assert.ok(html.includes(price), price);
    assert.ok(html.includes(escapeHtml(t.signInPrompt)));
    assert.doesNotMatch(html, /shopier\.com/);
    assert.ok(!html.includes(escapeHtml(t.buyOnShopier)));
    assert.ok(!html.includes(escapeHtml(t.balance.split("{count}")[0])), "no balance for a guest");
    assert.deepEqual(repositoryCalls, [], "a guest triggers no account or balance read");
  });

  it("gives a signed-in account its balance, its email and only the valid links", async () => {
    signedIn();
    const html = await render();
    assert.ok(html.includes(escapeHtml(t.balance.replace("{count}", "7"))));
    assert.ok(html.includes(escapeHtml(t.accountEmail.replace("{email}", "ayse@example.test"))));
    assert.ok(html.includes(escapeHtml(t.emailMatchHint)));
    assert.ok(html.includes(`href="${VALID_10}"`));
    assert.ok(html.includes(`href="${VALID_100}"`));
    assert.ok(!html.includes("10000002"), "the refused (http) link never reaches the client");
    assert.ok(html.includes(escapeHtml(t.notOnSale)), "the package with a refused link is shown as not on sale");
    assert.equal([...html.matchAll(/target="_blank"/g)].length, 2);
    assert.equal([...html.matchAll(/rel="noopener noreferrer"/g)].length, 2);
    assert.ok(!html.includes(escapeHtml(t.signInPrompt)));
  });

  it("explains the manual process without promising a time", async () => {
    const html = await render();
    assert.ok(html.includes(escapeHtml(t.howItWorksTitle)));
    for (const step of t.howItWorksSteps) assert.ok(html.includes(escapeHtml(step)), step);
    assert.ok(html.includes(escapeHtml(t.manualNotice)));
  });

  it("shows every package closed when no link is configured — sales start closed", async () => {
    for (const name of VARIABLES) delete process.env[name];
    signedIn();
    const html = await render();
    assert.ok(html.includes(escapeHtml(t.noneOnSale)));
    assert.equal(html.split(escapeHtml(t.notOnSale)).length - 1, 3);
    assert.doesNotMatch(html, /shopier\.com/);
  });

  it("treats a session whose account no longer exists as a guest", async () => {
    session = { user: { id: "gone" } };
    const html = await render();
    assert.ok(html.includes(escapeHtml(t.signInPrompt)));
    assert.doesNotMatch(html, /shopier\.com/);
  });
});

// The "Buy Tokens" entry points (header, homepage hero): plain links to
// /tokens, the same for every visitor — no session, no package data, and
// always after the primary "write" CTA.
describe("/tokens entry points", () => {
  const buyTokens = escapeHtml(getDictionary(defaultLocale).nav.buyTokens);
  const linksTo = (html: string, href: string) => [...html.matchAll(new RegExp(`href="${href}"`, "g"))].map((m) => m.index!);

  it("puts a secondary /tokens link next to the write CTA in both header zones (lg and below lg)", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <SiteHeader />
      </LocaleProvider>
    );
    const tokens = linksTo(html, "/tokens");
    const write = linksTo(html, "/write");
    assert.equal(tokens.length, 2, "one in the lg: centre, one in the below-lg CTA row");
    assert.equal(write.length, 2);
    assert.ok(write[0] < tokens[0] && tokens[0] < write[1] && write[1] < tokens[1], "each /tokens link follows its zone's write CTA");
    assert.equal(html.split(`>${buyTokens}</a>`).length - 1, 2);
    assert.doesNotMatch(html, /shopier\.com/);
    assert.deepEqual(repositoryCalls, [], "rendering the header reads no account or balance");
  });

  it("adds the same session-free link beside the homepage's write CTA", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <HomeHero activeCount={0} heroNotes={[]} />
      </LocaleProvider>
    );
    const tokens = linksTo(html, "/tokens");
    const write = linksTo(html, "/write");
    assert.equal(tokens.length, 1);
    assert.equal(write.length, 1);
    assert.ok(write[0] < tokens[0], "after the write CTA");
    assert.ok(html.includes(`>${buyTokens}</a>`));
    assert.doesNotMatch(html, /shopier\.com/);
    assert.deepEqual(repositoryCalls, []);
  });
});
