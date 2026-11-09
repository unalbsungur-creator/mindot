import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { invitationRepository } from "./repository";

// MN-01: "one invitation email per recipient per 24 hours" against real
// PostgreSQL. Run through `npm run test:db:invitations` (throwaway Docker
// Postgres, URL in TOKEN_TEST_DATABASE_URL). Skipped without one.

function localTestUrl(): string | null {
  const raw = process.env.TOKEN_TEST_DATABASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/mindot_token_test") {
    throw new Error("TOKEN_TEST_DATABASE_URL must point at the local mindot_token_test database");
  }
  return raw;
}

const TEST_URL = localTestUrl();

describe("invitation email rate limit on PostgreSQL", { skip: TEST_URL ? false : "TOKEN_TEST_DATABASE_URL is not set" }, () => {
  let sql: ReturnType<typeof postgres>;
  let adminId: string;

  before(async () => {
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = TEST_URL!;
    sql = postgres(TEST_URL!, { max: 2, onnotice: () => {} });
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    adminId = `admin-${crypto.randomUUID()}`;
    await sql`insert into users (id, email, role, name) values (${adminId}, ${`${adminId}@example.test`}, 'admin', 'Admin')`;
  });

  after(async () => {
    await sql?.end({ timeout: 5 });
    await (globalThis as { mindotSql?: ReturnType<typeof postgres> }).mindotSql?.end({ timeout: 5 });
  });

  async function invite(recipientEmail: string, status: "sent" | "failed" | "not_configured", hoursAgo = 0) {
    const created = await invitationRepository.create({ recipientEmail, maxUses: 1, expiresAt: null, createdBy: adminId });
    await invitationRepository.updateEmailStatus(created.id, status);
    if (hoursAgo) await sql`update invitations set created_at = now() - make_interval(hours => ${hoursAgo}) where id = ${created.id}`;
  }

  it("blocks a second email to the same address within 24 hours, case-insensitively", async () => {
    await invite("Recent@Example.test", "sent");
    assert.equal(await invitationRepository.hasRecentSentEmail("recent@example.test", 24), true);
    assert.equal(await invitationRepository.hasRecentSentEmail("RECENT@EXAMPLE.TEST", 24), true);
    assert.equal(await invitationRepository.hasRecentSentEmail("other@example.test", 24), false);
  });

  it("allows it again after 24 hours", async () => {
    await invite("older@example.test", "sent", 25);
    assert.equal(await invitationRepository.hasRecentSentEmail("older@example.test", 24), false);
  });

  it("does not count a send that failed or wasn't configured", async () => {
    await invite("failed@example.test", "failed");
    await invite("unconfigured@example.test", "not_configured");
    assert.equal(await invitationRepository.hasRecentSentEmail("failed@example.test", 24), false);
    assert.equal(await invitationRepository.hasRecentSentEmail("unconfigured@example.test", 24), false);
  });
});
