/**
 * EPIC 030: creates or updates the one credentials-capable admin account —
 * the account /admin/login signs in against, independent of Google OAuth.
 * Run with `npm run db:create-admin`. Idempotent and safe to re-run (e.g.
 * to rotate the password): upserts by a fixed id, never duplicates.
 *
 * The real password is never written to source control, README, or any
 * committed file — it's read from the ADMIN_PASSWORD environment variable
 * at the moment this script runs, hashed immediately, and only the hash is
 * ever persisted. Put it in `.env.local` (gitignored) for local use, or set
 * it directly in your shell/deployment secret store — never commit it.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. a deploy environment with real env vars already set) — fine.
}

import { eq } from "drizzle-orm";
import { hashPassword } from "../../features/users/lib/password";
import { generatePublicId } from "../../features/users/lib/identifiers";
import { getDb } from "./client";
import { users } from "./schema";

// Fixed and readable (unlike a Google `sub`) so this script is idempotent —
// re-running it updates the same row rather than creating a second admin.
const ADMIN_ID = "admin-credentials-0001";

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME ?? "Ünal'ın admin hesabı";
  // A synthetic, non-routable placeholder — `users.email` is NOT NULL/unique
  // and this account has no real Google identity to supply one. Never used
  // for actual delivery (see features/email/) since this account never
  // signs in with Google and receives no invitation/notification email.
  const email = process.env.ADMIN_EMAIL ?? "admin@mindot.local";

  if (!password) {
    console.error(
      "ADMIN_PASSWORD is not set. Set it in .env.local (never commit it) or your shell before running this script, e.g.:\n" +
        "  ADMIN_PASSWORD='a-strong-password' npm run db:create-admin"
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD is too short — use at least 12 characters.");
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);
  const now = new Date();

  const [existing] = await db.select().from(users).where(eq(users.id, ADMIN_ID)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        username,
        passwordHash,
        name: displayName,
        role: "admin",
        status: "active",
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, ADMIN_ID));
    console.log(`Updated existing admin credentials for username "${username}".`);
  } else {
    await db.insert(users).values({
      id: ADMIN_ID,
      email,
      name: displayName,
      image: null,
      role: "admin",
      publicId: generatePublicId(),
      username,
      passwordHash,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created admin credentials for username "${username}".`);
  }

  console.log("Sign in at /admin/login with that username and the password you set in ADMIN_PASSWORD.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
