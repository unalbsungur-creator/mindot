/**
 * Runs the token repository tests against a throwaway PostgreSQL in Docker.
 *
 *   npm run test:db:tokens
 *
 * Never reads DATABASE_URL, STAGING_DATABASE_URL or any .env file: the test
 * URL is built here from a fresh container (local postgres:16-alpine image,
 * bound to 127.0.0.1 on a random port, data on tmpfs, random passwords) and
 * passed to the tests as TOKEN_TEST_DATABASE_URL.
 *
 * The tests (migrations included) run as APP_ROLE, not the container's
 * superuser: a LOGIN role with no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/
 * BYPASSRLS that owns the test database — so it owns every table the
 * migrations create, like the application role on Neon. The superuser URL
 * is used here only to create that role and database, and never reaches the
 * tests. Inherited database
 * variables are removed from the child's environment. The container is
 * removed in `finally`, whatever the outcome. Never prints the password.
 *
 * Exit codes: the test run's own code; 2 if Docker or the container fails.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

const IMAGE = "postgres:16-alpine";
const DATABASE = "mindot_token_test";
const TEST_FILE = "src/features/tokens/repository.db.test.ts";
const APP_ROLE = "mindot_app";
const name = `mindot-token-test-${randomBytes(4).toString("hex")}`;
// Hex only, so both are safe to inline in CREATE ROLE below.
const password = randomBytes(18).toString("hex");
const appPassword = randomBytes(18).toString("hex");

function docker(args) {
  return spawnSync("docker", args, { encoding: "utf-8" });
}

async function createAppDatabase(superuserUrl) {
  const sql = postgres(superuserUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(
      `create role ${APP_ROLE} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${appPassword}'`
    );
    await sql.unsafe(`create database ${DATABASE} owner ${APP_ROLE}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function waitForDatabase(url) {
  // The image's init phase listens on a Unix socket only, so the first
  // successful TCP query means the final server is up.
  for (let attempt = 0; attempt < 60; attempt++) {
    const sql = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
    try {
      await sql`select 1`;
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      await sql.end({ timeout: 1 }).catch(() => {});
    }
  }
  return false;
}

let exitCode = 2;
let started = false;
try {
  if (docker(["image", "inspect", IMAGE]).status !== 0) {
    console.error(`Docker image ${IMAGE} is not available locally.`);
  } else {
    const run = docker([
      "run", "-d", "--rm", "--name", name,
      "-e", `POSTGRES_PASSWORD=${password}`,
      "-p", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data",
      IMAGE,
    ]);
    started = run.status === 0;
    const port = started ? docker(["port", name, "5432/tcp"]).stdout.trim().split(":").pop() : "";
    if (!started || !/^\d+$/.test(port)) {
      console.error("Could not start the test container.");
    } else {
      const superuserUrl = `postgres://postgres:${password}@127.0.0.1:${port}/postgres`;
      const url = `postgres://${APP_ROLE}:${appPassword}@127.0.0.1:${port}/${DATABASE}`;
      console.log(`Test container ${name} on 127.0.0.1:${port}`);
      if (!(await waitForDatabase(superuserUrl))) {
        console.error("The test database did not become ready.");
      } else if (
        !(await createAppDatabase(superuserUrl).then(
          () => true,
          (error) => (console.error(`Could not create the test role/database: ${error.message}`), false)
        ))
      ) {
        // Reported above; exit code stays 2.
      } else {
        console.log(`Tests run as non-superuser role ${APP_ROLE}, owner of ${DATABASE}`);
        const env = { ...process.env, TOKEN_TEST_DATABASE_URL: url };
        for (const key of ["DATABASE_URL", "STAGING_DATABASE_URL", "APP_ENV", "PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"]) {
          delete env[key];
        }
        const tests = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--experimental-test-module-mocks", "--test", TEST_FILE], {
          env,
          stdio: "inherit",
        });
        exitCode = tests.status ?? 1;
      }
    }
  }
} finally {
  if (started) {
    const removed = docker(["rm", "-f", name]);
    console.log(removed.status === 0 ? `Removed test container ${name}` : `FAILED to remove test container ${name}`);
    if (removed.status !== 0) exitCode = 2;
  }
}
process.exit(exitCode);
