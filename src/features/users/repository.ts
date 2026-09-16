import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { generatePublicId } from "./lib/identifiers";
import type { CredentialsUser, GoogleProfile, User } from "./types";

const MAX_GENERATION_ATTEMPTS = 5;

// EPIC 030: after this many consecutive failed credentials sign-ins, the
// account is locked out for LOCKOUT_MINUTES — DB-persisted (see schema.ts's
// failedLoginAttempts/lockedUntil doc comment) so it survives a restart or
// a different serverless instance handling the next request.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface UserRepository {
  getById(id: string): Promise<User | null>;
  /** Batched lookup — used by the board's tile query to resolve avatars for a page of messages in one round trip instead of N. */
  getByIds(ids: string[]): Promise<User[]>;
  /**
   * Creates the user on first sign-in, or refreshes name/image on every
   * later sign-in. Deliberately never overwrites `role` on an existing
   * row, and always creates a brand-new row with `role: "user"` — see the
   * implementation below and EPIC 035/036 in CLAUDE.md's "Authorization /
   * admin role" section. Every newly-created row is given a publicId
   * immediately.
   */
  upsertFromGoogleProfile(profile: GoogleProfile): Promise<User>;
  /** Resolves a user by their /u/[publicId] identifier — never by database id or email. Returns null for an unknown or not-yet-assigned id. */
  getByPublicId(publicId: string): Promise<User | null>;
  /** Idempotent: returns the existing publicId, or generates, persists, and returns a new one for a row that predates EPIC 009. */
  ensurePublicId(userId: string): Promise<string>;
  /** EPIC 011: owner-only setting, toggled from features/profile/actions.ts (which re-verifies the session before calling this). */
  setPublicWallEnabled(userId: string, enabled: boolean): Promise<User | null>;
  /** EPIC 011: owner-only setting; `description` is already trimmed/length-capped by the caller (features/profile/actions.ts) — this just persists it. `null` clears it. */
  setPublicWallDescription(userId: string, description: string | null): Promise<User | null>;
  /**
   * EPIC 013: every user, for the admin management surface — small volume
   * in practice (see /admin/users), same "no pagination abstraction until
   * it's actually needed" precedent as the moderation/reports/invitations
   * admin lists. Newest first, matching those same lists' convention.
   */
  listAll(): Promise<User[]>;
  /**
   * The real "can't double-suspend / can't race with itself" boundary: an
   * atomic conditional `UPDATE ... WHERE id = ? AND status = 'active'`,
   * same pattern as messageRepository.approve/reject/archive. Returns
   * `null` if the account doesn't exist or is already suspended — the
   * caller (features/users/moderation-actions.ts) doesn't need to
   * distinguish those itself.
   */
  suspend(userId: string, adminId: string, reason: string | null): Promise<User | null>;
  /** The inverse — atomic conditional `UPDATE ... WHERE status = 'suspended'`. Clears `statusReason` to null; see the schema doc comment for why. */
  unsuspend(userId: string, adminId: string): Promise<User | null>;
  /**
   * EPIC 030: the *only* read that ever touches `passwordHash` — a narrow,
   * dedicated shape (never the shared `User` type) so a password hash can
   * never flow into `/admin/users`' listing or anywhere else a plain `User`
   * already reaches a client. Used exclusively by the Credentials
   * provider's `authorize()` in features/auth/auth.ts. Returns `null` for
   * an unknown email or a row with no `passwordHash` set (a Google-only
   * account can never sign in this way, even if its email happened to
   * match). EPIC 036 (email-based admin login): `email` is the lookup key
   * now, not `username` — `username` still exists on the row and is still
   * unique, but it's no longer what a sign-in attempt is looked up by.
   * Caller is responsible for trimming/lowercasing `email` first.
   */
  getCredentialsByEmail(email: string): Promise<CredentialsUser | null>;
  /** Increments the failed-attempt counter and, once MAX_FAILED_LOGIN_ATTEMPTS is reached, sets `lockedUntil` LOCKOUT_MINUTES ahead — see schema.ts. */
  recordFailedLogin(userId: string): Promise<void>;
  /** Resets the failed-attempt counter/lockout on a successful credentials sign-in. */
  recordSuccessfulLogin(userId: string): Promise<void>;
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    role: row.role,
    publicId: row.publicId,
    publicWallEnabled: row.publicWallEnabled,
    publicWallDescription: row.publicWallDescription,
    status: row.status,
    statusReason: row.statusReason,
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    statusChangedBy: row.statusChangedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class DrizzleUserRepository implements UserRepository {
  async getById(id: string): Promise<User | null> {
    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async getByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const db = getDb();
    const rows = await db.select().from(users).where(inArray(users.id, ids));
    return rows.map(toUser);
  }

  async upsertFromGoogleProfile(profile: GoogleProfile): Promise<User> {
    const db = getDb();
    const now = new Date();

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const [row] = await db
          .insert(users)
          .values({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            image: profile.image,
            // EPIC 035: a Google sign-in never grants admin, regardless of
            // email — always "user" on creation, full stop. Admin is a
            // separate, dedicated Credentials identity (see
            // src/lib/db/createAdmin.ts / ADMIN_EMAIL / ADMIN_USERNAME /
            // ADMIN_PASSWORD); ongoing role changes for any account are
            // database-managed (the `role` column directly, or a future
            // admin-management UI), never derived from an email match at
            // sign-in time.
            role: "user",
            publicId: generatePublicId(),
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: users.id,
            // `role` and `publicId` are intentionally absent: on conflict,
            // Postgres leaves both at whatever the existing row already
            // has, exactly like `role` already did before EPIC 009.
            set: { name: profile.name, image: profile.image, updatedAt: now },
          })
          .returning();

        return toUser(row);
      } catch (error) {
        lastError = error; // publicId unique-constraint collision — astronomically unlikely; retry with a fresh one.
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not generate a unique public id.");
  }

  async getByPublicId(publicId: string): Promise<User | null> {
    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.publicId, publicId)).limit(1);
    return row ? toUser(row) : null;
  }

  async ensurePublicId(userId: string): Promise<string> {
    const db = getDb();
    const existing = await this.getById(userId);
    if (existing?.publicId) return existing.publicId;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const [row] = await db
          .update(users)
          .set({ publicId: generatePublicId(), updatedAt: new Date() })
          .where(eq(users.id, userId))
          .returning({ publicId: users.publicId });
        if (row?.publicId) return row.publicId;
      } catch (error) {
        lastError = error; // unique-constraint collision — retry with a fresh one.
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not generate a unique public id.");
  }

  async setPublicWallEnabled(userId: string, enabled: boolean): Promise<User | null> {
    const db = getDb();
    const [row] = await db
      .update(users)
      .set({ publicWallEnabled: enabled, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return row ? toUser(row) : null;
  }

  async setPublicWallDescription(userId: string, description: string | null): Promise<User | null> {
    const db = getDb();
    const [row] = await db
      .update(users)
      .set({ publicWallDescription: description, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return row ? toUser(row) : null;
  }

  async listAll(): Promise<User[]> {
    const db = getDb();
    const rows = await db.select().from(users).orderBy(users.createdAt);
    return rows.map(toUser);
  }

  async suspend(userId: string, adminId: string, reason: string | null): Promise<User | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(users)
      .set({ status: "suspended", statusReason: reason, statusChangedAt: now, statusChangedBy: adminId, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .returning();
    return row ? toUser(row) : null;
  }

  async unsuspend(userId: string, adminId: string): Promise<User | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(users)
      .set({ status: "active", statusReason: null, statusChangedAt: now, statusChangedBy: adminId, updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.status, "suspended")))
      .returning();
    return row ? toUser(row) : null;
  }

  async getCredentialsByEmail(email: string): Promise<CredentialsUser | null> {
    const db = getDb();
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row || !row.passwordHash) return null;
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      status: row.status,
      passwordHash: row.passwordHash,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
    };
  }

  async recordFailedLogin(userId: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(users)
      .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`, updatedAt: now })
      .where(eq(users.id, userId))
      .returning({ failedLoginAttempts: users.failedLoginAttempts });
    if (row && row.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      await db
        .update(users)
        .set({ lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) })
        .where(eq(users.id, userId));
    }
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    const db = getDb();
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}

export const userRepository: UserRepository = new DrizzleUserRepository();
