import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { publicPurchaseUrl } from "../lib/publicPurchaseUrl";
import { getDilekkutumUrl } from "./dilekkutum";
import { getShoppierProductUrl } from "./shoppier";

describe("publicPurchaseUrl", () => {
  it("is null when unset or blank — the 'not available yet' state", () => {
    for (const value of [undefined, "", "   ", "\n"]) assert.equal(publicPurchaseUrl(value), null, JSON.stringify(value));
  });

  it("keeps an absolute http(s) URL, trimmed", () => {
    assert.equal(publicPurchaseUrl(" https://www.shopier.com/123456 "), "https://www.shopier.com/123456");
    assert.equal(publicPurchaseUrl("http://dilekkutum.com/"), "http://dilekkutum.com/");
  });

  it("refuses anything a link shouldn't point at", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com", "/relative/path", "www.shopier.com", "not a url"]) {
      assert.equal(publicPurchaseUrl(value), null, value);
    }
  });
});

describe("purchase link config (server-side, read per call)", () => {
  const saved = { shoppier: process.env.SHOPPIER_PRODUCT_URL, dilekkutum: process.env.DILEKKUTUM_URL };
  afterEach(() => {
    for (const [key, value] of [["SHOPPIER_PRODUCT_URL", saved.shoppier], ["DILEKKUTUM_URL", saved.dilekkutum]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("is null for both when the variables are unset", () => {
    delete process.env.SHOPPIER_PRODUCT_URL;
    delete process.env.DILEKKUTUM_URL;
    assert.equal(getShoppierProductUrl(), null);
    assert.equal(getDilekkutumUrl(), null);
  });

  it("reads the current runtime value on every call, not once at import", () => {
    delete process.env.SHOPPIER_PRODUCT_URL;
    assert.equal(getShoppierProductUrl(), null);
    process.env.SHOPPIER_PRODUCT_URL = "https://www.shopier.com/123456";
    process.env.DILEKKUTUM_URL = "https://dilekkutum.com/";
    assert.equal(getShoppierProductUrl(), "https://www.shopier.com/123456");
    assert.equal(getDilekkutumUrl(), "https://dilekkutum.com/");
  });

  it("treats an unusable value as unset", () => {
    process.env.SHOPPIER_PRODUCT_URL = "javascript:alert(1)";
    process.env.DILEKKUTUM_URL = "dilekkutum.com";
    assert.equal(getShoppierProductUrl(), null);
    assert.equal(getDilekkutumUrl(), null);
  });
});

// A non-NEXT_PUBLIC_ variable read in a "use client" module is undefined in the
// browser bundle but set during the server render: the two renders differ
// (hydration mismatch) and the client never shows the configured value. Server
// pages read such values and pass them down as props instead.
describe("client components never read server-only configuration", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
    });
  }
  const clientFiles = sourceFiles("src")
    .map((path) => ({ path, text: readFileSync(path, "utf-8") }))
    .filter(({ text }) => /^\s*["']use client["']/.test(text));

  it("finds the client components it guards (sanity check)", () => {
    const paths = clientFiles.map(({ path }) => path.replace(/\\/g, "/"));
    assert.ok(paths.includes("src/app/share/[messageId]/_components/SharePageContent.tsx"));
    assert.ok(paths.includes("src/app/memory/[messageId]/_components/MemoryPageContent.tsx"));
  });

  it("imports neither purchase-link config module from a client component", () => {
    const offenders = clientFiles.filter(({ text }) => /from\s+["'][^"']*config\/(shoppier|dilekkutum)["']/.test(text)).map(({ path }) => path);
    assert.deepEqual(offenders, []);
  });

  it("reads no process.env variable other than NEXT_PUBLIC_* / NODE_ENV in a client component", () => {
    const offenders = clientFiles.flatMap(({ path, text }) =>
      [...text.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
        .map((match) => match[1])
        .filter((name) => !name.startsWith("NEXT_PUBLIC_") && name !== "NODE_ENV")
        .map((name) => `${path}: ${name}`)
    );
    assert.deepEqual(offenders, []);
  });
});
