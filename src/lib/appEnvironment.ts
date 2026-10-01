import { PRODUCTION_SITE_URL, STAGING_SITE_URL } from "./siteConfig";

/**
 * Which deployment this process is. Declared explicitly with `APP_ENV`
 * (a non-secret Worker var — see wrangler.jsonc's `env.staging`), never
 * guessed from the request's hostname. Unset keeps the behavior every
 * existing deployment already has: `production` under a production build,
 * `development` otherwise — so production needs no new variable.
 *
 * Deliberately free of `next/*` imports: the tsx scripts under src/lib
 * (staging build/migrate) and the node:test suite use it directly.
 */
export type AppEnvironment = "development" | "staging" | "production";

const APP_ENVIRONMENTS: readonly AppEnvironment[] = ["development", "staging", "production"];

type EnvSource = Record<string, string | undefined>;

export class EnvironmentIsolationError extends Error {
  readonly code = "ENVIRONMENT_ISOLATION_ERROR";

  constructor(readonly problems: string[]) {
    super(`Deployment environment is misconfigured: ${problems.join(" ")}`);
    this.name = "EnvironmentIsolationError";
  }
}

function read(env: EnvSource, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

export function resolveAppEnvironment(env: EnvSource = process.env): AppEnvironment {
  const declared = read(env, "APP_ENV");
  if (declared === undefined) return env.NODE_ENV === "production" ? "production" : "development";
  if ((APP_ENVIRONMENTS as readonly string[]).includes(declared)) return declared as AppEnvironment;
  throw new EnvironmentIsolationError([`APP_ENV must be one of ${APP_ENVIRONMENTS.join(", ")}.`]);
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const PRODUCTION_ORIGIN = new URL(PRODUCTION_SITE_URL).origin;
const STAGING_ORIGIN = new URL(STAGING_SITE_URL).origin;

/**
 * The URL-level isolation rules between production and staging. Values
 * only ever appear in the result as the environment-variable *name* —
 * never echo a configured value (it may sit next to secrets in a log).
 *
 * - staging: AUTH_URL is required and must be exactly the staging origin
 *   (Auth.js derives every OAuth redirect_uri from it, so this is what
 *   keeps Google/Apple callbacks off production's), and NEXT_PUBLIC_APP_URL,
 *   when set, must match it.
 * - production: neither URL may point at staging.
 * - development: unrestricted (localhost, LAN IP, the dev tunnel).
 */
export function getEnvironmentIsolationProblems(appEnv: AppEnvironment, env: EnvSource = process.env): string[] {
  const authOrigin = originOf(read(env, "AUTH_URL"));
  const appOrigin = originOf(read(env, "NEXT_PUBLIC_APP_URL"));
  const problems: string[] = [];

  if (appEnv === "staging") {
    if (authOrigin !== STAGING_ORIGIN) problems.push("AUTH_URL must be the staging origin.");
    if (read(env, "NEXT_PUBLIC_APP_URL") !== undefined && appOrigin !== STAGING_ORIGIN) {
      problems.push("NEXT_PUBLIC_APP_URL must be the staging origin.");
    }
    if (authOrigin === PRODUCTION_ORIGIN || appOrigin === PRODUCTION_ORIGIN) {
      problems.push("A staging deployment must never use the production origin.");
    }
  }

  if (appEnv === "production" && (authOrigin === STAGING_ORIGIN || appOrigin === STAGING_ORIGIN)) {
    problems.push("A production deployment must never use the staging origin.");
  }

  return problems;
}

/**
 * Runtime enforcement — staging only. Production keeps its existing,
 * unchanged behavior; its side of the rules is covered by the config
 * tests instead (src/lib/appEnvironment.test.ts). Throws rather than
 * degrading: a misconfigured staging deployment should not serve sign-in
 * at all.
 */
export function assertStagingIsolation(env: EnvSource = process.env): void {
  if (resolveAppEnvironment(env) !== "staging") return;
  const problems = getEnvironmentIsolationProblems("staging", env);
  if (problems.length > 0) throw new EnvironmentIsolationError(problems);
}

export function isStaging(env: EnvSource = process.env): boolean {
  return resolveAppEnvironment(env) === "staging";
}
