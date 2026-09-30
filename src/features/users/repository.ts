import { and, eq, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  digitalAccessCodes,
  invitations,
  memoryPdfUnlocks,
  memoryProjects,
  messageLikes,
  messageReports,
  messages,
  notifications,
  physicalOrders,
  tokenLedger,
  tokenWallets,
  userBlocks,
  users,
} from "@/lib/db/schema";
import { generatePublicId } from "./lib/identifiers";
import { appleUserId } from "./lib/providerIds";
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
  /**
   * Sign in with Apple's counterpart to upsertFromGoogleProfile: the row id
   * is `apple:<sub>` (see lib/providerIds.ts), a new row is always
   * role "user", and a later sign-in never touches `role` or `email` — it
   * only fills in `name` when Apple sent one (first consent only). Callers
   * must have run `classifyProviderSignIn` first: a new row needs an email.
   */
  upsertFromAppleProfile(profile: { sub: string; email: string | null; name: string | null }): Promise<User>;
  /**
   * Run before any OAuth sign-in creates a row. `existing`: this provider
   * identity already has an account. `new`: safe to create one.
   * `email-in-use`: a *different* account already has this email — the
   * sign-in is refused, never merged: MINDOT has no verified account-linking
   * flow, and attaching a new provider identity to an account just because
   * the email matches would be an account-takeover path. `email-missing`:
   * a new account can't be created without one.
   */
  classifyProviderSignIn(userId: string, email: string | null): Promise<"existing" | "new" | "email-in-use" | "email-missing">;
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
  /**
   * Whether `id` is still a live, non-tombstone account — the one extra
   * read the Auth.js `jwt` callback makes per request, so a session cookie
   * minted before its account was deleted stops authenticating at once.
   */
  isActiveAccount(id: string): Promise<boolean>;
  /** Irreversibly deletes a (non-admin) account — see the implementation's doc comment. */
  deleteAccount(userId: string): Promise<DeleteAccountResult>;
}

export type DeleteAccountResult = { status: "deleted" } | { status: "not-found" } | { status: "admin-account" };

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

  async upsertFromAppleProfile(profile: { sub: string; email: string | null; name: string | null }): Promise<User> {
    const db = getDb();
    const id = appleUserId(profile.sub);
    const now = new Date();

    const existing = await this.getById(id);
    if (existing) {
      if (!profile.name || profile.name === existing.name) return existing;
      const [row] = await db.update(users).set({ name: profile.name, updatedAt: now }).where(eq(users.id, id)).returning();
      return toUser(row);
    }
    if (!profile.email) throw new Error("A new Apple account needs an email.");

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const [row] = await db
          .insert(users)
          .values({
            id,
            email: profile.email,
            name: profile.name,
            image: null,
            // Same rule as Google: a provider sign-in never grants admin.
            role: "user",
            publicId: generatePublicId(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return toUser(row);
      } catch (error) {
        lastError = error;
        // A concurrent first sign-in of the same Apple account won the race.
        const raced = await this.getById(id);
        if (raced) return raced;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not create the Apple account.");
  }

  async classifyProviderSignIn(userId: string, email: string | null): Promise<"existing" | "new" | "email-in-use" | "email-missing"> {
    const db = getDb();
    const [own] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (own) return "existing";
    if (!email) return "email-missing";
    const [other] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);
    return other ? "email-in-use" : "new";
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
    // Tombstones (deleted accounts' PII-free stand-ins) aren't users anyone manages.
    const rows = await db.select().from(users).where(isNull(users.deletedAt)).orderBy(users.createdAt);
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

  async isActiveAccount(id: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return row !== undefined;
  }

  /**
   * Account deletion — one transaction, so it either fully happens or not
   * at all. Like tokenRepository.consumeForMemoryPdfUnlock, this is a
   * deliberate cross-table write: atomicity across every table that
   * references `users.id` can't be split over per-feature repositories.
   *
   * The deleted user's own row is removed physically — its id is their
   * Google `sub`, itself a stable personal identifier, and keeping it would
   * let the same Google account "revive" the old row on its next sign-in
   * (upsertFromGoogleProfile upserts on id). Records that must outlive the
   * account are re-pointed to a fresh, random-id *tombstone* row carrying
   * no personal data (`deletedAt` set, no email/name/image/publicId), so
   * every foreign key stays valid without keeping anything identifying:
   *
   *   DELETED
   *     - users row (email, name, image, publicId, wall settings)
   *     - notifications they received
   *     - user blocks in both directions (their own block list, and blocks
   *       of them — their content is anonymized, so those can't apply anymore)
   *     - their likes (like counts decremented to stay consistent)
   *     - never-published messages (pending/rejected) nobody else references
   *     - memory projects with no order, unlock, or access code
   *   ANONYMIZED (re-pointed to the tombstone)
   *     - published/archived messages, and any message something else still
   *       references: author name → "anonymous", isAnonymous, off the
   *       personal wall, pending edits dropped. Approved placement is
   *       permanent and other people's keepsakes/orders reference these
   *       rows, so they stay on the board, unattributed.
   *     - memory projects that have an order, unlock, or redeemed code
   *     - physical_orders, token_ledger, token_wallets, memory_pdf_unlocks,
   *       digital_access_codes.redeemed_by — purchase/accounting records
   *       (no personal data of their own). A remaining token balance stays
   *       with the tombstone, unspendable.
   *     - reports they filed (moderation history about someone else's content)
   *
   * TODO(legal): whether retained purchase/ledger/order records meet (or
   * must be limited to) specific statutory retention periods is a legal
   * question — the privacy policy's deletion/retention wording needs
   * professional review against this behavior before launch.
   *
   * Admin accounts are refused: the admin identity is provisioned
   * out-of-band (db:create-admin), not self-service.
   *
   * Every FK to users.id is handled below; a reference added later without
   * updating this method makes the final DELETE fail, rolling everything
   * back — never a partial deletion.
   */
  async deleteAccount(userId: string): Promise<DeleteAccountResult> {
    const db = getDb();
    return db.transaction(async (tx) => {
      // Lock the row: a concurrent second deletion waits, then finds nothing.
      const [account] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .for("update");
      if (!account) return { status: "not-found" as const };
      if (account.role === "admin") return { status: "admin-account" as const };

      const now = new Date();
      const tombstoneId = `deleted_${crypto.randomUUID()}`;
      await tx.insert(users).values({
        id: tombstoneId,
        // email is NOT NULL UNIQUE; `.invalid` is a reserved, never-routable TLD.
        email: `${tombstoneId}@deleted.invalid`,
        role: "user",
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await tx.delete(notifications).where(eq(notifications.recipientUserId, userId));
      await tx.delete(userBlocks).where(or(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, userId)));

      await tx
        .update(messages)
        .set({ likeCount: sql`greatest(${messages.likeCount} - 1, 0)` })
        .where(
          inArray(messages.id, tx.select({ id: messageLikes.messageId }).from(messageLikes).where(eq(messageLikes.userId, userId)))
        );
      await tx.delete(messageLikes).where(eq(messageLikes.userId, userId));

      await tx
        .delete(messages)
        .where(
          and(
            eq(messages.authorId, userId),
            inArray(messages.status, ["pending", "rejected"]),
            notExists(tx.select({ id: memoryProjects.id }).from(memoryProjects).where(eq(memoryProjects.messageId, messages.id))),
            notExists(tx.select({ id: messageReports.id }).from(messageReports).where(eq(messageReports.messageId, messages.id))),
            notExists(tx.select({ id: messageLikes.id }).from(messageLikes).where(eq(messageLikes.messageId, messages.id))),
            notExists(tx.select({ id: notifications.id }).from(notifications).where(eq(notifications.messageId, messages.id)))
          )
        );
      await tx
        .update(messages)
        .set({
          authorId: tombstoneId,
          authorName: "anonymous",
          isAnonymous: true,
          showOnPersonalWall: false,
          pendingContent: null,
          revisionSubmittedAt: null,
          revisionRejectionReason: null,
          updatedAt: now,
        })
        .where(eq(messages.authorId, userId));

      await tx
        .delete(memoryProjects)
        .where(
          and(
            eq(memoryProjects.createdBy, userId),
            notExists(tx.select({ id: physicalOrders.id }).from(physicalOrders).where(eq(physicalOrders.memoryProjectId, memoryProjects.id))),
            notExists(tx.select({ id: memoryPdfUnlocks.id }).from(memoryPdfUnlocks).where(eq(memoryPdfUnlocks.memoryProjectId, memoryProjects.id))),
            notExists(
              tx.select({ id: digitalAccessCodes.id }).from(digitalAccessCodes).where(eq(digitalAccessCodes.memoryProjectId, memoryProjects.id))
            )
          )
        );
      await tx.update(memoryProjects).set({ createdBy: tombstoneId, updatedAt: now }).where(eq(memoryProjects.createdBy, userId));
      await tx.update(physicalOrders).set({ createdBy: tombstoneId }).where(eq(physicalOrders.createdBy, userId));
      await tx.update(digitalAccessCodes).set({ redeemedBy: tombstoneId }).where(eq(digitalAccessCodes.redeemedBy, userId));
      await tx.update(memoryPdfUnlocks).set({ userId: tombstoneId }).where(eq(memoryPdfUnlocks.userId, userId));
      await tx.update(tokenWallets).set({ userId: tombstoneId, updatedAt: now }).where(eq(tokenWallets.userId, userId));
      await tx.update(tokenLedger).set({ userId: tombstoneId }).where(eq(tokenLedger.userId, userId));
      await tx.update(messageReports).set({ reporterId: tombstoneId }).where(eq(messageReports.reporterId, userId));

      // Admin-only audit columns — a non-admin is never referenced here
      // today, but re-pointing (not skipping) keeps the final DELETE valid.
      await tx.update(tokenLedger).set({ createdBy: tombstoneId }).where(eq(tokenLedger.createdBy, userId));
      await tx.update(messageReports).set({ reviewedBy: tombstoneId }).where(eq(messageReports.reviewedBy, userId));
      await tx.update(messages).set({ moderatedBy: tombstoneId }).where(eq(messages.moderatedBy, userId));
      await tx.update(messages).set({ revisionReviewedBy: tombstoneId }).where(eq(messages.revisionReviewedBy, userId));
      await tx.update(invitations).set({ createdBy: tombstoneId }).where(eq(invitations.createdBy, userId));
      await tx.update(users).set({ statusChangedBy: tombstoneId }).where(eq(users.statusChangedBy, userId));

      await tx.delete(users).where(eq(users.id, userId));
      return { status: "deleted" as const };
    });
  }
}

export const userRepository: UserRepository = new DrizzleUserRepository();
