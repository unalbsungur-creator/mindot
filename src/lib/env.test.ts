import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { EnvironmentIsolationError } from "./appEnvironment";
import { getMobileAuthConfig, MOBILE_JWT_AUDIENCE, RuntimeConfigurationError } from "./env";
import { PRODUCTION_SITE_URL, STAGING_SITE_URL } from "./siteConfig";

const KEYS = ["APP_ENV", "AUTH_URL", "NEXT_PUBLIC_APP_URL", "MOBILE_JWT_SECRET"] as const;
const SECRET = "a-mobile-jwt-secret-of-at-least-32-bytes";
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

describe("getMobileAuthConfig", () => {
  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("fails closed without MOBILE_JWT_SECRET", () => {
    setEnv({ NEXT_PUBLIC_APP_URL: PRODUCTION_SITE_URL });
    assert.throws(
      () => getMobileAuthConfig(),
      (error: unknown) => error instanceof RuntimeConfigurationError && error.variable === "MOBILE_JWT_SECRET" && error.problem === "missing"
    );
  });

  it("rejects a secret shorter than 32 bytes, without echoing it", () => {
    const short = "x".repeat(31);
    setEnv({ NEXT_PUBLIC_APP_URL: PRODUCTION_SITE_URL, MOBILE_JWT_SECRET: short });
    assert.throws(
      () => getMobileAuthConfig(),
      (error: unknown) =>
        error instanceof RuntimeConfigurationError && error.problem === "invalid" && !error.message.includes(short)
    );
  });

  it("measures the secret in bytes, not characters", () => {
    // 16 two-byte characters = 32 bytes.
    setEnv({ NEXT_PUBLIC_APP_URL: PRODUCTION_SITE_URL, MOBILE_JWT_SECRET: "ş".repeat(16) });
    assert.doesNotThrow(() => getMobileAuthConfig());
  });

  it("builds the config from the canonical origin, a fixed audience and a 15-minute TTL", () => {
    setEnv({ NEXT_PUBLIC_APP_URL: `${PRODUCTION_SITE_URL}/some/path`, MOBILE_JWT_SECRET: SECRET });
    assert.deepEqual(getMobileAuthConfig(), {
      mobileJwtSecret: SECRET,
      mobileJwtIssuer: PRODUCTION_SITE_URL,
      mobileJwtAudience: "mindot-mobile-api",
      accessTokenTtlSeconds: 900,
    });
    assert.equal(MOBILE_JWT_AUDIENCE, "mindot-mobile-api");
  });

  it("uses the staging origin as the issuer on staging", () => {
    setEnv({ APP_ENV: "staging", AUTH_URL: STAGING_SITE_URL, NEXT_PUBLIC_APP_URL: STAGING_SITE_URL, MOBILE_JWT_SECRET: SECRET });
    const config = getMobileAuthConfig();
    assert.equal(config.mobileJwtIssuer, new URL(STAGING_SITE_URL).origin);
    assert.equal(config.mobileJwtAudience, MOBILE_JWT_AUDIENCE);
  });

  it("refuses a staging deployment that breaks isolation", () => {
    for (const env of [
      { APP_ENV: "staging", MOBILE_JWT_SECRET: SECRET },
      { APP_ENV: "staging", AUTH_URL: PRODUCTION_SITE_URL, MOBILE_JWT_SECRET: SECRET },
      { APP_ENV: "staging", AUTH_URL: STAGING_SITE_URL, NEXT_PUBLIC_APP_URL: PRODUCTION_SITE_URL, MOBILE_JWT_SECRET: SECRET },
    ]) {
      setEnv(env);
      assert.throws(() => getMobileAuthConfig(), EnvironmentIsolationError);
    }
  });
});
