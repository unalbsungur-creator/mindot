/**
 * GÖREV 44 — Test Group 1: the per-environment Turnstile runtime config
 * (adminLoginTurnstileRuntime in ./turnstile) resolves the allowed challenge
 * hostnames strictly from the deployment environment, and fails safe on an
 * unknown APP_ENV rather than falling back to anything permissive.
 *
 * The expected hostnames are DERIVED from siteConfig (never hardcoded here),
 * so this test tracks the single source of truth if the domains ever change.
 *
 * Pure and offline: adminLoginTurnstileRuntime reads APP_ENV from process.env
 * at call time (via resolveAppEnvironment), so these tests only mutate and
 * restore process.env.APP_ENV — no network, no database, no next/* imports.
 * APP_ENV is saved/restored around every test so nothing leaks between tests;
 * node's test runner isolates each test FILE in its own process, so this
 * mutation can never contaminate another suite either.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { EnvironmentIsolationError } from "@/lib/appEnvironment";
import { PRODUCTION_SITE_URL, STAGING_SITE_URL } from "@/lib/siteConfig";
import { adminLoginTurnstileRuntime } from "./turnstile";

const PRODUCTION_HOST = new URL(PRODUCTION_SITE_URL).hostname;
const STAGING_HOST = new URL(STAGING_SITE_URL).hostname;

describe("adminLoginTurnstileRuntime — allowed hostnames per environment", () => {
  let savedAppEnv: string | undefined;

  beforeEach(() => {
    savedAppEnv = process.env.APP_ENV;
  });

  afterEach(() => {
    if (savedAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = savedAppEnv;
  });

  it("C1: APP_ENV=staging allows only the staging hostname", () => {
    process.env.APP_ENV = "staging";
    assert.deepEqual(adminLoginTurnstileRuntime().allowedHostnames, [STAGING_HOST]);
  });

  it("C2: APP_ENV=production allows only the production hostname", () => {
    process.env.APP_ENV = "production";
    assert.deepEqual(adminLoginTurnstileRuntime().allowedHostnames, [PRODUCTION_HOST]);
  });

  it("C3: APP_ENV=development allows only localhost / 127.0.0.1", () => {
    process.env.APP_ENV = "development";
    assert.deepEqual(adminLoginTurnstileRuntime().allowedHostnames, ["localhost", "127.0.0.1"]);
  });

  it("C4: an unknown APP_ENV throws, with no permissive fallback", () => {
    process.env.APP_ENV = "prod";
    assert.throws(() => adminLoginTurnstileRuntime(), EnvironmentIsolationError);
  });
});
