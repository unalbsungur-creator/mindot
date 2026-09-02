import { randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { invitations } from "@/lib/db/schema";
import type { Invitation, InvitationEmailStatus } from "./types";

export interface NewInvitationInput {
  recipientEmail: string | null;
  maxUses: number;
  expiresAt: Date | null;
  createdBy: string;
}

/**
 * Repository abstraction over invitation storage. The UI and Server
 * Functions depend only on this interface — `getByToken`/`recordUse` are
 * unchanged since EPIC 002; `create`/`list`/`revoke` are new for the admin
 * invitations page (EPIC 005), added rather than replacing anything.
 */
export interface InvitationRepository {
  getByToken(token: string): Promise<Invitation | null>;
  recordUse(token: string): Promise<Invitation | null>;
  create(input: NewInvitationInput): Promise<Invitation>;
  /** All invitations, newest first — the admin management list. */
  list(): Promise<Invitation[]>;
  revoke(id: string): Promise<Invitation | null>;
  /** EPIC: E-mail Daveti — set once, right after create(), by the same Server Action (see actions.ts). */
  updateEmailStatus(id: string, status: InvitationEmailStatus): Promise<Invitation | null>;
}

/** URL-safe, unguessable — not the row id, and not derived from anything predictable. */
function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function toInvitation(row: typeof invitations.$inferSelect): Invitation {
  return {
    id: row.id,
    token: row.token,
    status: row.status,
    recipientEmail: row.recipientEmail,
    emailStatus: row.emailStatus,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    usedAt: row.usedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

class DrizzleInvitationRepository implements InvitationRepository {
  async getByToken(token: string): Promise<Invitation | null> {
    const db = getDb();
    const [row] = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
    return row ? toInvitation(row) : null;
  }

  async recordUse(token: string): Promise<Invitation | null> {
    const db = getDb();

    // A single atomic UPDATE (not read-then-write) so concurrent uses of
    // the same invitation can't race past maxUses.
    const [row] = await db
      .update(invitations)
      .set({
        usedCount: sql`${invitations.usedCount} + 1`,
        status: sql`CASE WHEN ${invitations.usedCount} + 1 >= ${invitations.maxUses}
          THEN 'used'::invitation_status ELSE ${invitations.status} END`,
        usedAt: sql`CASE WHEN ${invitations.usedCount} + 1 >= ${invitations.maxUses}
          THEN now() ELSE ${invitations.usedAt} END`,
      })
      .where(eq(invitations.token, token))
      .returning();

    return row ? toInvitation(row) : null;
  }

  async create(input: NewInvitationInput): Promise<Invitation> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .insert(invitations)
      .values({
        id: crypto.randomUUID(),
        token: generateToken(),
        status: "active",
        recipientEmail: input.recipientEmail,
        maxUses: input.maxUses,
        usedCount: 0,
        createdBy: input.createdBy,
        createdAt: now,
        expiresAt: input.expiresAt,
        usedAt: null,
        revokedAt: null,
      })
      .returning();
    return toInvitation(row);
  }

  async list(): Promise<Invitation[]> {
    const db = getDb();
    const rows = await db.select().from(invitations).orderBy(desc(invitations.createdAt));
    return rows.map(toInvitation);
  }

  async revoke(id: string): Promise<Invitation | null> {
    const db = getDb();
    const [row] = await db
      .update(invitations)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(invitations.id, id))
      .returning();
    return row ? toInvitation(row) : null;
  }

  async updateEmailStatus(id: string, status: InvitationEmailStatus): Promise<Invitation | null> {
    const db = getDb();
    const [row] = await db
      .update(invitations)
      .set({ emailStatus: status })
      .where(eq(invitations.id, id))
      .returning();
    return row ? toInvitation(row) : null;
  }
}

export const invitationRepository: InvitationRepository = new DrizzleInvitationRepository();
