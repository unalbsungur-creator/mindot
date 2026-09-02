import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { generatePublicId } from "./lib/identifiers";
import type { GoogleProfile, User, UserRole } from "./types";

const MAX_GENERATION_ATTEMPTS = 5;

export interface UserRepository {
  getById(id: string): Promise<User | null>;
  /** Batched lookup — used by the board's tile query to resolve avatars for a page of messages in one round trip instead of N. */
  getByIds(ids: string[]): Promise<User[]>;
  /**
   * Creates the user on first sign-in, or refreshes name/image on every
   * later sign-in. Deliberately never overwrites `role` on an existing row
   * — see `initialRoleFor` for why. Every newly-created row is given a
   * publicId immediately.
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
}

/**
 * Environment-based bootstrap for the very first administrator(s). This is
 * consulted only when a user row is first created (a brand-new sign-in) —
 * changing ADMIN_EMAILS later does not retroactively promote or demote
 * anyone already in the database. Ongoing role management is DB-driven:
 * update the `role` column directly (or a future admin-management UI) to
 * add more admins.
 */
function initialRoleFor(email: string): UserRole {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? "admin" : "user";
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
            role: initialRoleFor(profile.email),
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
}

export const userRepository: UserRepository = new DrizzleUserRepository();
