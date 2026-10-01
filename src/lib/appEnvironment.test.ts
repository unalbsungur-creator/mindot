/**
 * `npm test` — environment-isolation checks for production vs staging:
 * the runtime rules in appEnvironment.ts, the Worker configuration in
 * wrangler.jsonc, and the migration journal staging is migrated from.
 * Plain node:test run through tsx (no test framework dependency).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  assertStagingIsolation,
  EnvironmentIsolationError,
  getEnvironmentIsolationProblems,
  resolveAppEnvironment,
} from "./appEnvironment";
import { PRODUCTION_SITE_URL, STAGING_SITE_URL } from "./siteConfig";

const STAGING = { APP_ENV: "staging", AUTH_URL: STAGING_SITE_URL, NEXT_PUBLIC_APP_URL: STAGING_SITE_URL };

describe("resolveAppEnvironment", () => {
  it("keeps today's behavior when APP_ENV is unset", () => {
    assert.equal(resolveAppEnvironment({ NODE_ENV: "production" }), "production");
    assert.equal(resolveAppEnvironment({ NODE_ENV: "development" }), "development");
  });

  it("uses an explicit APP_ENV, never the hostname", () => {
    assert.equal(resolveAppEnvironment({ NODE_ENV: "production", APP_ENV: "staging" }), "staging");
  });

  it("rejects an unknown APP_ENV", () => {
    assert.throws(() => resolveAppEnvironment({ APP_ENV: "prod" }), EnvironmentIsolationError);
  });
});

describe("environment isolation", () => {
  it("accepts a correctly configured staging deployment", () => {
    assert.deepEqual(getEnvironmentIsolationProblems("staging", STAGING), []);
    assert.doesNotThrow(() => assertStagingIsolation(STAGING));
  });

  it("refuses staging without AUTH_URL", () => {
    assert.throws(() => assertStagingIsolation({ APP_ENV: "staging" }), EnvironmentIsolationError);
  });

  it("refuses staging pointed at the production origin", () => {
    const env = { APP_ENV: "staging", AUTH_URL: PRODUCTION_SITE_URL, NEXT_PUBLIC_APP_URL: PRODUCTION_SITE_URL };
    assert.ok(getEnvironmentIsolationProblems("staging", env).length > 0);
    assert.throws(() => assertStagingIsolation(env), EnvironmentIsolationError);
  });

  it("refuses staging whose public URL disagrees with AUTH_URL", () => {
    const env = { ...STAGING, NEXT_PUBLIC_APP_URL: "https://dev.mind-ot.com" };
    assert.ok(getEnvironmentIsolationProblems("staging", env).length > 0);
  });

  it("flags production pointed at the staging origin", () => {
    assert.ok(getEnvironmentIsolationProblems("production", { AUTH_URL: STAGING_SITE_URL }).length > 0);
    assert.deepEqual(
      getEnvironmentIsolationProblems("production", { AUTH_URL: PRODUCTION_SITE_URL, NEXT_PUBLIC_APP_URL: PRODUCTION_SITE_URL }),
      []
    );
  });

  it("never enforces anything at runtime outside staging", () => {
    assert.doesNotThrow(() => assertStagingIsolation({ NODE_ENV: "production", AUTH_URL: STAGING_SITE_URL }));
    assert.doesNotThrow(() => assertStagingIsolation({ NODE_ENV: "development", AUTH_URL: "http://localhost:3200" }));
  });

  it("never echoes configured values in its messages", () => {
    const secretLooking = "https://user:hunter2@example.com";
    const problems = getEnvironmentIsolationProblems("staging", { APP_ENV: "staging", AUTH_URL: secretLooking });
    assert.ok(problems.every((problem) => !problem.includes("hunter2")));
  });
});

/** JSONC → JSON: drops // and /* *\/ comments outside strings, and trailing commas. */
function parseJsonc(source: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      out += ch;
      if (ch === "\\") out += source[++i];
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && source[i + 1] === "*") {
      i = source.indexOf("*/", i + 2) + 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

type WorkerConfig = {
  name: string;
  preview_urls?: boolean;
  workers_dev?: boolean;
  routes?: { pattern: string; custom_domain?: boolean }[];
  vars?: Record<string, string>;
  hyperdrive?: { binding: string; id: string }[];
  env?: Record<string, WorkerConfig>;
};

describe("wrangler.jsonc", () => {
  const config = parseJsonc(readFileSync("wrangler.jsonc", "utf-8")) as WorkerConfig;
  const staging = config.env?.staging;
  const productionHyperdriveId = config.hyperdrive?.find((h) => h.binding === "HYPERDRIVE")?.id;

  it("leaves production as the unchanged top-level Worker", () => {
    assert.equal(config.name, "mindot");
    assert.ok(productionHyperdriveId, "production HYPERDRIVE binding must stay configured");
    assert.equal(config.vars?.APP_ENV, undefined);
    assert.ok(!(config.routes ?? []).some((route) => route.pattern.includes("staging")));
  });

  it("defines staging as a separate Worker on the one fixed hostname", () => {
    assert.ok(staging, "env.staging must exist");
    assert.notEqual(staging.name, config.name);
    assert.deepEqual(staging.routes, [{ pattern: new URL(STAGING_SITE_URL).host, custom_domain: true }]);
    assert.equal(staging.preview_urls, false);
    assert.equal(staging.workers_dev, false);
  });

  it("gives staging a staging-only identity", () => {
    assert.deepEqual(getEnvironmentIsolationProblems("staging", staging?.vars ?? {}), []);
    assert.equal(staging?.vars?.APP_ENV, "staging");
  });

  it("never gives staging production's database binding", () => {
    for (const binding of staging?.hyperdrive ?? []) {
      assert.notEqual(binding.id, productionHyperdriveId);
    }
  });

  it("keeps secrets out of the committed config", () => {
    const names = [config.vars, staging?.vars].flatMap((vars) => Object.keys(vars ?? {}));
    for (const secret of ["AUTH_SECRET", "DATABASE_URL", "GOOGLE_CLIENT_SECRET", "AUTH_APPLE_SECRET", "AUTH_APPLE_TOKEN_KEY"]) {
      assert.ok(!names.includes(secret), `${secret} must be a wrangler secret, not a var`);
    }
  });
});

describe("migration journal", () => {
  it("lists every committed migration exactly once, in order", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf-8")) as {
      entries: { idx: number; tag: string }[];
    };
    const files = readdirSync("drizzle")
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();
    assert.deepEqual(
      journal.entries.map((entry) => entry.idx),
      journal.entries.map((_, index) => index)
    );
    assert.deepEqual(
      journal.entries.map((entry) => entry.tag),
      files
    );
    for (const [index, tag] of files.entries()) assert.ok(tag.startsWith(String(index).padStart(4, "0")));
  });
});
