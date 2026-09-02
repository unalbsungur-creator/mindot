import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { digitalAccessCodes, memoryProjects, physicalOrders } from "@/lib/db/schema";
import { generateAccessCode, generateOrderNumber, normalizeCode } from "./lib/identifiers";
import type {
  DigitalAccessCode,
  MemoryProject,
  NewMemoryProjectInput,
  PhysicalOrder,
  PhysicalOrderStatus,
} from "./types";

const MAX_GENERATION_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Memory projects
// ---------------------------------------------------------------------------

export interface MemoryRepository {
  create(input: NewMemoryProjectInput): Promise<MemoryProject>;
  getById(id: string): Promise<MemoryProject | null>;
  listByCreator(userId: string): Promise<MemoryProject[]>;
}

function toMemoryProject(row: typeof memoryProjects.$inferSelect): MemoryProject {
  return {
    id: row.id,
    messageId: row.messageId,
    createdBy: row.createdBy,
    captureMode: row.captureMode,
    outputType: row.outputType,
    frameTemplateId: row.frameTemplateId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class DrizzleMemoryRepository implements MemoryRepository {
  async create(input: NewMemoryProjectInput): Promise<MemoryProject> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .insert(memoryProjects)
      .values({ id: crypto.randomUUID(), ...input, status: "draft", createdAt: now, updatedAt: now })
      .returning();
    return toMemoryProject(row);
  }

  async getById(id: string): Promise<MemoryProject | null> {
    const db = getDb();
    const [row] = await db.select().from(memoryProjects).where(eq(memoryProjects.id, id)).limit(1);
    return row ? toMemoryProject(row) : null;
  }

  async listByCreator(userId: string): Promise<MemoryProject[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(memoryProjects)
      .where(eq(memoryProjects.createdBy, userId))
      .orderBy(desc(memoryProjects.createdAt));
    return rows.map(toMemoryProject);
  }
}

export const memoryRepository: MemoryRepository = new DrizzleMemoryRepository();

// ---------------------------------------------------------------------------
// Digital access codes
// ---------------------------------------------------------------------------

export interface IssueAccessCodeInput {
  expiresAt?: Date | null;
  externalProvider: string;
  externalReference?: string | null;
}

export type AccessCodeRedemptionStatus = "not-found" | "active" | "redeemed" | "revoked" | "expired";

export interface DigitalAccessCodeRepository {
  /** Issues an unassigned code — see "Digital product & access code flow" in CLAUDE.md for why it isn't tied to a project yet. */
  issue(input: IssueAccessCodeInput): Promise<DigitalAccessCode>;
  getByCode(code: string): Promise<DigitalAccessCode | null>;
  /** Atomically assigns an active, unexpired code to a project and marks it redeemed. Returns null if the code can't be used. */
  redeem(code: string, memoryProjectId: string, redeemedBy: string): Promise<DigitalAccessCode | null>;
  hasRedeemedCodeForProject(memoryProjectId: string): Promise<boolean>;
  /** The redeemed code row for a project, if any — for showing a persisted "access granted" state, not just a boolean. */
  getRedeemedForProject(memoryProjectId: string): Promise<DigitalAccessCode | null>;
  /** Diagnoses why a redemption would fail, for precise user-facing messaging. Never the actual authorization check — `redeem`'s atomic UPDATE is. */
  getRedemptionStatus(code: string): Promise<AccessCodeRedemptionStatus>;
  /** Admin view — every code, newest first. */
  list(): Promise<DigitalAccessCode[]>;
  /** Revokes an unused ("active") code. Returns null if the code doesn't exist or is no longer active (already redeemed/expired/revoked) — a redeemed code can't be revoked out from under whoever already has access. */
  revoke(id: string): Promise<DigitalAccessCode | null>;
}

function toAccessCode(row: typeof digitalAccessCodes.$inferSelect): DigitalAccessCode {
  return {
    id: row.id,
    memoryProjectId: row.memoryProjectId,
    code: row.code,
    status: row.status,
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    redeemedBy: row.redeemedBy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    externalProvider: row.externalProvider,
    externalReference: row.externalReference,
    createdAt: row.createdAt.toISOString(),
  };
}

class DrizzleDigitalAccessCodeRepository implements DigitalAccessCodeRepository {
  async issue(input: IssueAccessCodeInput): Promise<DigitalAccessCode> {
    const db = getDb();
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const [row] = await db
          .insert(digitalAccessCodes)
          .values({
            id: crypto.randomUUID(),
            memoryProjectId: null,
            code: generateAccessCode(),
            status: "active",
            expiresAt: input.expiresAt ?? null,
            externalProvider: input.externalProvider,
            externalReference: input.externalReference ?? null,
            createdAt: new Date(),
          })
          .returning();
        return toAccessCode(row);
      } catch (error) {
        lastError = error; // unique constraint collision — astronomically unlikely; retry.
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not generate a unique access code.");
  }

  async getByCode(code: string): Promise<DigitalAccessCode | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(digitalAccessCodes)
      .where(eq(digitalAccessCodes.code, normalizeCode(code)))
      .limit(1);
    return row ? toAccessCode(row) : null;
  }

  async redeem(code: string, memoryProjectId: string, redeemedBy: string): Promise<DigitalAccessCode | null> {
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(digitalAccessCodes)
      .set({ status: "redeemed", memoryProjectId, redeemedAt: now, redeemedBy })
      .where(
        and(
          eq(digitalAccessCodes.code, normalizeCode(code)),
          eq(digitalAccessCodes.status, "active"),
          sql`(${digitalAccessCodes.expiresAt} is null or ${digitalAccessCodes.expiresAt} > now())`
        )
      )
      .returning();
    return row ? toAccessCode(row) : null;
  }

  async hasRedeemedCodeForProject(memoryProjectId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ id: digitalAccessCodes.id })
      .from(digitalAccessCodes)
      .where(and(eq(digitalAccessCodes.memoryProjectId, memoryProjectId), eq(digitalAccessCodes.status, "redeemed")))
      .limit(1);
    return row !== undefined;
  }

  async getRedeemedForProject(memoryProjectId: string): Promise<DigitalAccessCode | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(digitalAccessCodes)
      .where(and(eq(digitalAccessCodes.memoryProjectId, memoryProjectId), eq(digitalAccessCodes.status, "redeemed")))
      .limit(1);
    return row ? toAccessCode(row) : null;
  }

  async getRedemptionStatus(code: string): Promise<AccessCodeRedemptionStatus> {
    const row = await this.getByCode(code);
    if (!row) return "not-found";
    if (row.status === "revoked") return "revoked";
    if (row.status === "redeemed") return "redeemed";
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return "expired";
    return "active";
  }

  async list(): Promise<DigitalAccessCode[]> {
    const db = getDb();
    const rows = await db.select().from(digitalAccessCodes).orderBy(desc(digitalAccessCodes.createdAt));
    return rows.map(toAccessCode);
  }

  async revoke(id: string): Promise<DigitalAccessCode | null> {
    const db = getDb();
    const [row] = await db
      .update(digitalAccessCodes)
      .set({ status: "revoked" })
      .where(and(eq(digitalAccessCodes.id, id), eq(digitalAccessCodes.status, "active")))
      .returning();
    return row ? toAccessCode(row) : null;
  }
}

export const digitalAccessCodeRepository: DigitalAccessCodeRepository = new DrizzleDigitalAccessCodeRepository();

// ---------------------------------------------------------------------------
// Physical orders
// ---------------------------------------------------------------------------

export interface PhysicalOrderRepository {
  create(memoryProjectId: string, createdBy: string): Promise<PhysicalOrder>;
  getById(id: string): Promise<PhysicalOrder | null>;
  getByOrderNumber(orderNumber: string): Promise<PhysicalOrder | null>;
  getByMemoryProjectId(memoryProjectId: string): Promise<PhysicalOrder | null>;
  /** Admin view — every order, newest first. */
  listAll(): Promise<PhysicalOrder[]>;
  /** One buyer's own orders, newest first — the personal archive's physical-order history (EPIC 009). */
  listByCreator(userId: string): Promise<PhysicalOrder[]>;
  updateStatus(id: string, status: PhysicalOrderStatus): Promise<PhysicalOrder | null>;
}

function toPhysicalOrder(row: typeof physicalOrders.$inferSelect): PhysicalOrder {
  return {
    id: row.id,
    memoryProjectId: row.memoryProjectId,
    orderNumber: row.orderNumber,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

class DrizzlePhysicalOrderRepository implements PhysicalOrderRepository {
  async create(memoryProjectId: string, createdBy: string): Promise<PhysicalOrder> {
    const db = getDb();
    const now = new Date();
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const [row] = await db
          .insert(physicalOrders)
          .values({
            id: crypto.randomUUID(),
            memoryProjectId,
            orderNumber: generateOrderNumber(),
            status: "pending",
            createdBy,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return toPhysicalOrder(row);
      } catch (error) {
        lastError = error; // unique constraint collision — astronomically unlikely; retry.
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Could not generate a unique order number.");
  }

  async getById(id: string): Promise<PhysicalOrder | null> {
    const db = getDb();
    const [row] = await db.select().from(physicalOrders).where(eq(physicalOrders.id, id)).limit(1);
    return row ? toPhysicalOrder(row) : null;
  }

  async getByOrderNumber(orderNumber: string): Promise<PhysicalOrder | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(physicalOrders)
      .where(eq(physicalOrders.orderNumber, orderNumber.trim().toUpperCase()))
      .limit(1);
    return row ? toPhysicalOrder(row) : null;
  }

  async getByMemoryProjectId(memoryProjectId: string): Promise<PhysicalOrder | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(physicalOrders)
      .where(eq(physicalOrders.memoryProjectId, memoryProjectId))
      .limit(1);
    return row ? toPhysicalOrder(row) : null;
  }

  async listAll(): Promise<PhysicalOrder[]> {
    const db = getDb();
    const rows = await db.select().from(physicalOrders).orderBy(desc(physicalOrders.createdAt));
    return rows.map(toPhysicalOrder);
  }

  async listByCreator(userId: string): Promise<PhysicalOrder[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(physicalOrders)
      .where(eq(physicalOrders.createdBy, userId))
      .orderBy(desc(physicalOrders.createdAt));
    return rows.map(toPhysicalOrder);
  }

  async updateStatus(id: string, status: PhysicalOrderStatus): Promise<PhysicalOrder | null> {
    const db = getDb();
    const [row] = await db
      .update(physicalOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(physicalOrders.id, id))
      .returning();
    return row ? toPhysicalOrder(row) : null;
  }
}

export const physicalOrderRepository: PhysicalOrderRepository = new DrizzlePhysicalOrderRepository();
