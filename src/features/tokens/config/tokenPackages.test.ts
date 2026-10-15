import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  TOKEN_PACKAGES,
  getTokenPackage,
  getTokenPackageOffers,
  getTokenPackagePurchaseUrl,
  isTokenPackageId,
  shopierProductUrl,
  type TokenPackageId,
} from "./tokenPackages";

const URL_VARIABLES = {
  "tokens-10": "SHOPIER_TOKEN_10_URL",
  "tokens-50": "SHOPIER_TOKEN_50_URL",
  "tokens-100": "SHOPIER_TOKEN_100_URL",
} as const satisfies Record<TokenPackageId, string>;

// Placeholder product paths — test data only, not the real listings.
const VALID: Record<TokenPackageId, string> = {
  "tokens-10": "https://www.shopier.com/example-shop/10000001",
  "tokens-50": "https://www.shopier.com/example-shop/10000002",
  "tokens-100": "https://www.shopier.com/example-shop/10000003",
};

const saved = Object.fromEntries(Object.values(URL_VARIABLES).map((name) => [name, process.env[name]]));

function restoreVariables() {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function clearVariables() {
  for (const name of Object.values(URL_VARIABLES)) delete process.env[name];
}

describe("token packages", () => {
  it("are exactly 10 / 50 / 100 Tokens for 12 / 50 / 80 TL", () => {
    assert.deepEqual(
      TOKEN_PACKAGES.map(({ id, tokens, priceTry }) => ({ id, tokens, priceTry })),
      [
        { id: "tokens-10", tokens: 10, priceTry: 12 },
        { id: "tokens-50", tokens: 50, priceTry: 50 },
        { id: "tokens-100", tokens: 100, priceTry: 80 },
      ]
    );
  });

  it("are frozen, so nothing at runtime can change an amount or a price", () => {
    assert.ok(Object.isFrozen(TOKEN_PACKAGES));
    for (const pkg of TOKEN_PACKAGES) assert.ok(Object.isFrozen(pkg), pkg.id);
  });

  it("are looked up only by their exact id", () => {
    assert.equal(getTokenPackage("tokens-50")?.tokens, 50);
    for (const id of ["tokens-25", "TOKENS-10", "10", "", "tokens-10 "]) {
      assert.equal(getTokenPackage(id), null, JSON.stringify(id));
      assert.equal(isTokenPackageId(id), false, JSON.stringify(id));
    }
    for (const value of [undefined, null, 10, {}]) assert.equal(isTokenPackageId(value), false);
    for (const pkg of TOKEN_PACKAGES) assert.equal(isTokenPackageId(pkg.id), true);
  });
});

describe("shopierProductUrl", () => {
  it("accepts an https www.shopier.com product link, returned unchanged (trimmed)", () => {
    assert.equal(shopierProductUrl(VALID["tokens-10"]), VALID["tokens-10"]);
    assert.equal(shopierProductUrl(`  ${VALID["tokens-50"]}\n`), VALID["tokens-50"]);
    const withQuery = "https://www.shopier.com/example-shop/10000003?ref=mindot";
    assert.equal(shopierProductUrl(withQuery), withQuery);
  });

  it("treats a missing or blank value as not on sale", () => {
    for (const value of [undefined, "", "   ", "\n\t"]) assert.equal(shopierProductUrl(value), null, JSON.stringify(value));
  });

  it("refuses http and every other scheme", () => {
    for (const value of [
      "http://www.shopier.com/example-shop/10000001",
      "ftp://www.shopier.com/example-shop/10000001",
      "javascript:alert(1)",
      "data:text/html,x",
      "//www.shopier.com/example-shop/10000001",
      "www.shopier.com/example-shop/10000001",
    ]) {
      assert.equal(shopierProductUrl(value), null, value);
    }
  });

  it("refuses any hostname other than exactly www.shopier.com", () => {
    for (const value of [
      "https://shopier.com/example-shop/10000001",
      "https://shop.shopier.com/example-shop/10000001",
      "https://www.shopier.com.evil.example/example-shop/10000001",
      "https://www.shopier.co/example-shop/10000001",
      "https://wwwshopier.com/example-shop/10000001",
      "https://www-shopier.com/example-shop/10000001",
      "https://evil.example/www.shopier.com/10000001",
      "https://www.shopier.com.@evil.example/10000001",
      "https://WWW.SHOPIER.COM/example-shop/10000001",
    ]) {
      assert.equal(shopierProductUrl(value), null, value);
    }
  });

  it("refuses credentials in the link", () => {
    for (const value of [
      "https://user@www.shopier.com/example-shop/10000001",
      "https://user:secret@www.shopier.com/example-shop/10000001",
      "https://:secret@www.shopier.com/example-shop/10000001",
    ]) {
      assert.equal(shopierProductUrl(value), null, value);
    }
  });

  it("refuses an explicit port, the default one included", () => {
    for (const value of [
      "https://www.shopier.com:8443/example-shop/10000001",
      "https://www.shopier.com:443/example-shop/10000001",
      "https://www.shopier.com:/example-shop/10000001",
    ]) {
      assert.equal(shopierProductUrl(value), null, value);
    }
  });

  it("refuses values the URL parser would silently rewrite, and the bare homepage", () => {
    for (const value of [
      "https://www.shopier.com/example-shop/1000\n0001",
      "https://www.shopier.com/example shop/10000001",
      "https://www.shopier.com/example-shop/10000001\t",
      "https:\\\\www.shopier.com\\example-shop\\10000001",
      "https://www.shopier.com\\example-shop/10000001",
      "https://www.shopier.com/example-shop/\u000010000001",
      "https://www.shopier.com/",
      "https://www.shopier.com",
    ]) {
      // A trailing tab is outer whitespace (trimmed) — that one stays valid.
      const expected = value.endsWith("\t") ? value.trim() : null;
      assert.equal(shopierProductUrl(value), expected, JSON.stringify(value));
    }
  });

  it("never throws on malformed or oversized input", () => {
    const inputs: (string | undefined)[] = [
      "https://",
      "https://www.shopier.com/%",
      "https://[www.shopier.com]/x",
      "https://www.shopier.com/" + "a".repeat(5000),
      "\u0000",
      "💥",
    ];
    for (const value of inputs) {
      assert.doesNotThrow(() => shopierProductUrl(value), JSON.stringify(value).slice(0, 60));
    }
    assert.equal(shopierProductUrl("https://www.shopier.com/" + "a".repeat(5000)), null);
    assert.equal(shopierProductUrl("https://"), null);
    // Non-string input (e.g. a misread config) is refused, not thrown on.
    assert.equal(shopierProductUrl(42 as unknown as string), null);
  });
});

describe("package purchase links (server-side runtime variables, read per call)", () => {
  beforeEach(clearVariables);
  afterEach(restoreVariables);

  it("are all closed when no variable is set — sales start closed", () => {
    for (const pkg of TOKEN_PACKAGES) assert.equal(getTokenPackagePurchaseUrl(pkg.id), null, pkg.id);
    assert.deepEqual(
      getTokenPackageOffers().map((offer) => offer.purchaseUrl),
      [null, null, null]
    );
  });

  it("each package reads only its own variable", () => {
    for (const pkg of TOKEN_PACKAGES) {
      clearVariables();
      process.env[URL_VARIABLES[pkg.id]] = VALID[pkg.id];
      for (const other of TOKEN_PACKAGES) {
        assert.equal(getTokenPackagePurchaseUrl(other.id), other.id === pkg.id ? VALID[pkg.id] : null, `${pkg.id} set, ${other.id} read`);
      }
    }
  });

  it("reads the current value on every call, not once at import", () => {
    assert.equal(getTokenPackagePurchaseUrl("tokens-50"), null);
    process.env.SHOPIER_TOKEN_50_URL = VALID["tokens-50"];
    assert.equal(getTokenPackagePurchaseUrl("tokens-50"), VALID["tokens-50"]);
    process.env.SHOPIER_TOKEN_50_URL = "";
    assert.equal(getTokenPackagePurchaseUrl("tokens-50"), null);
    delete process.env.SHOPIER_TOKEN_50_URL;
    assert.equal(getTokenPackagePurchaseUrl("tokens-50"), null);
  });

  it("closes only the package whose link is invalid; the others keep working", () => {
    process.env.SHOPIER_TOKEN_10_URL = VALID["tokens-10"];
    process.env.SHOPIER_TOKEN_50_URL = "http://www.shopier.com/example-shop/10000002";
    process.env.SHOPIER_TOKEN_100_URL = VALID["tokens-100"];
    assert.deepEqual(
      getTokenPackageOffers().map(({ id, tokens, priceTry, purchaseUrl }) => ({ id, tokens, priceTry, purchaseUrl })),
      [
        { id: "tokens-10", tokens: 10, priceTry: 12, purchaseUrl: VALID["tokens-10"] },
        { id: "tokens-50", tokens: 50, priceTry: 50, purchaseUrl: null },
        { id: "tokens-100", tokens: 100, priceTry: 80, purchaseUrl: VALID["tokens-100"] },
      ]
    );
  });

  it("keeps amounts and prices independent of whether a package is on sale", () => {
    const closed = getTokenPackageOffers();
    for (const [id, url] of Object.entries(VALID)) process.env[URL_VARIABLES[id as TokenPackageId]] = url;
    const open = getTokenPackageOffers();
    assert.deepEqual(
      closed.map(({ id, tokens, priceTry }) => ({ id, tokens, priceTry })),
      open.map(({ id, tokens, priceTry }) => ({ id, tokens, priceTry }))
    );
    assert.ok(open.every((offer) => offer.purchaseUrl !== null));
  });

  it("returns null for an unknown package id instead of throwing", () => {
    assert.equal(getTokenPackagePurchaseUrl("tokens-25" as TokenPackageId), null);
  });
});

// Same guard as memories/config/purchaseLinks.test.ts: a client component
// importing this module would read the server-only variables as undefined in
// the browser (and differently on the server render). Server pages pass the
// offers down as props instead.
describe("client components never import the token package config", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
  }

  it("has no \"use client\" module importing config/tokenPackages", () => {
    const offenders = sourceFiles("src")
      .map((path) => ({ path, text: readFileSync(path, "utf-8") }))
      .filter(({ text }) => /^\s*["']use client["']/.test(text))
      .filter(({ text }) => /from\s+["'][^"']*config\/tokenPackages["']/.test(text))
      .map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });
});
