"use server";

import { auth } from "@/features/auth/auth";
import { requireAdmin } from "@/features/auth/requireAdmin";
import { getPublicMessageById } from "@/features/board/repository";
import { tokenRepository } from "@/features/tokens/repository";
import { getActiveFrameTemplates } from "./config/frameTemplates";
import { manualDigitalPurchaseProvider } from "./providers/manualProvider";
import {
  digitalAccessCodeRepository,
  memoryPdfUnlockRepository,
  memoryRepository,
  physicalOrderRepository,
} from "./repository";
import type {
  DigitalAccessCode,
  MemoryCaptureMode,
  MemoryOutputType,
  MemoryProject,
  PhysicalOrder,
  PhysicalOrderStatus,
} from "./types";

export type MemoryActionError =
  | "auth-required"
  | "message-not-eligible"
  | "invalid-frame"
  | "not-found"
  | "forbidden"
  | "code-not-found"
  | "code-already-used"
  | "code-revoked"
  | "code-expired"
  | "invalid-code";

export interface CreateMemoryProjectInput {
  messageId: string;
  captureMode: MemoryCaptureMode;
  outputType: MemoryOutputType;
  frameTemplateId?: string;
}

export interface MemoryActionResult<T = undefined> {
  ok: boolean;
  error?: MemoryActionError;
  data?: T;
}

/**
 * Starts a memory project. Requires sign-in (the project's `createdBy`),
 * and requires the message to currently be public/approved — `messageId`
 * is never trusted to mean "this is a valid, public thought" on its own;
 * `getPublicMessageById` is the same privacy-respecting read the board
 * itself uses, so an anonymous message's real author never enters this
 * function's scope at all, and a pending/rejected message can never start
 * a project.
 */
export async function createMemoryProject(input: CreateMemoryProjectInput): Promise<MemoryActionResult<MemoryProject>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "auth-required" };

  const message = await getPublicMessageById(input.messageId);
  if (!message) return { ok: false, error: "message-not-eligible" };

  if (input.frameTemplateId && !getActiveFrameTemplates().some((t) => t.id === input.frameTemplateId)) {
    return { ok: false, error: "invalid-frame" };
  }

  const project = await memoryRepository.create({
    messageId: input.messageId,
    createdBy: session.user.id,
    captureMode: input.captureMode,
    outputType: input.outputType,
    frameTemplateId: input.frameTemplateId ?? null,
  });

  return { ok: true, data: project };
}

async function requireProjectOwner(memoryProjectId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "auth-required" as const };
  const project = await memoryRepository.getById(memoryProjectId);
  if (!project) return { error: "not-found" as const };
  if (project.createdBy !== session.user.id) return { error: "forbidden" as const };
  return { project, userId: session.user.id };
}

/**
 * Redeems a digital access code against the caller's own project. A code
 * only ever unlocks the one project it's redeemed against — see
 * DigitalAccessCodeRepository.redeem, an atomic conditional UPDATE that
 * refuses anything but an active, unexpired code. That UPDATE is the real
 * authorization boundary; `getRedemptionStatus` below only runs *after* it
 * fails, purely to produce a precise message — it never gates access
 * itself, so a race between the two can't weaken security, only (rarely)
 * make an error message a beat stale.
 */
export async function redeemAccessCode(memoryProjectId: string, code: string): Promise<MemoryActionResult> {
  const owner = await requireProjectOwner(memoryProjectId);
  if ("error" in owner) return { ok: false, error: owner.error };

  const redeemed = await digitalAccessCodeRepository.redeem(code, memoryProjectId, owner.userId);
  if (redeemed) return { ok: true };

  const status = await digitalAccessCodeRepository.getRedemptionStatus(code);
  const errorByStatus: Record<typeof status, MemoryActionError> = {
    "not-found": "code-not-found",
    redeemed: "code-already-used",
    revoked: "code-revoked",
    expired: "code-expired",
    active: "invalid-code", // active but the atomic redeem still failed — a genuine race; ask them to retry.
  };
  return { ok: false, error: errorByStatus[status] };
}

// Its own error union rather than new MemoryActionError members: the memory
// page maps every MemoryActionError to translated copy, and unlock errors
// get their UI (and translations) in a later step.
export type UnlockMemoryPdfError =
  | "auth-required"
  | "not-found"
  | "forbidden"
  | "not-eligible"
  | "message-not-eligible"
  | "insufficient-tokens"
  | "unlock-conflict";

export interface UnlockMemoryPdfResult {
  ok: boolean;
  error?: UnlockMemoryPdfError;
  data?: {
    projectId: string;
    /** `already_unlocked` means no token was spent by this call. */
    status: "newly_unlocked" | "already_unlocked";
    /** The caller's token balance after this call. */
    balance: number;
  };
}

/**
 * Spends 1 Token to permanently unlock the caller's own personal_pdf
 * project — an entitlement, not a per-download charge, so re-downloads
 * never spend again. The user is always the session's, never a client
 * argument. Ownership and eligibility (personal_pdf, source message still
 * public) are checked here first so an ineligible project is never charged;
 * the charge itself — wallet lock, conditional decrement, consume ledger
 * entry, unlock row — is one transaction in
 * `tokenRepository.consumeForMemoryPdfUnlock`, which is also what makes a
 * retry or a concurrent duplicate charge-free.
 */
export async function unlockMemoryPdf(memoryProjectId: string): Promise<UnlockMemoryPdfResult> {
  const owner = await requireProjectOwner(memoryProjectId);
  if ("error" in owner) return { ok: false, error: owner.error };
  const { project, userId } = owner;

  if (project.outputType !== "personal_pdf") return { ok: false, error: "not-eligible" };

  const message = await getPublicMessageById(project.messageId);
  if (!message) return { ok: false, error: "message-not-eligible" };

  // Fast path only — the transaction below re-checks under the wallet lock.
  const existing = await memoryPdfUnlockRepository.getByProjectId(project.id);
  if (existing) {
    const balance = await tokenRepository.getBalance(userId);
    return { ok: true, data: { projectId: project.id, status: "already_unlocked", balance } };
  }

  const result = await tokenRepository.consumeForMemoryPdfUnlock({ userId, memoryProjectId: project.id });
  switch (result.status) {
    case "newly_unlocked":
    case "already_unlocked":
      return { ok: true, data: { projectId: project.id, status: result.status, balance: result.balance } };
    case "insufficient_tokens":
      return { ok: false, error: "insufficient-tokens" };
    case "conflict":
      return { ok: false, error: "unlock-conflict" };
  }
}

/**
 * Creates a physical fulfilment order for the caller's own project.
 * Architecturally prepared, not live-integrated with DilekKutum — see
 * config/dilekkutum.ts and "Physical gift & DilekKutum flow" in
 * CLAUDE.md. The buyer manually enters the returned order number into
 * DilekKutum's order note; nothing here talks to DilekKutum directly.
 */
export async function createPhysicalOrder(memoryProjectId: string): Promise<MemoryActionResult<PhysicalOrder>> {
  const owner = await requireProjectOwner(memoryProjectId);
  if ("error" in owner) return { ok: false, error: owner.error };

  const order = await physicalOrderRepository.create(memoryProjectId, owner.userId);
  return { ok: true, data: order };
}

/**
 * Records that a digital sale happened somewhere else (Shoppier today,
 * manually) and issues an unassigned code for it. Architecturally
 * prepared, not live-integrated: this does not verify any real payment —
 * see providers/manualProvider.ts.
 */
export async function issueManualAccessCode(input: {
  expiresInDays?: number;
  reference?: string;
}): Promise<MemoryActionResult<DigitalAccessCode>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };

  const issued = await manualDigitalPurchaseProvider.issueAccessCode(input);
  // The provider abstraction only promises back a code string (a real
  // provider may not expose our internal row shape) — fetch the full
  // record here, at the action layer, for the admin UI to display.
  const record = await digitalAccessCodeRepository.getByCode(issued.code);
  if (!record) return { ok: false, error: "not-found" };
  return { ok: true, data: record };
}

export async function listAccessCodesAdmin(): Promise<MemoryActionResult<DigitalAccessCode[]>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };

  const codes = await digitalAccessCodeRepository.list();
  return { ok: true, data: codes };
}

/** Revokes an unused code. A code someone has already redeemed can't be pulled out from under their access this way — see the repository's `revoke`. */
export async function revokeAccessCodeAdmin(id: string): Promise<MemoryActionResult<DigitalAccessCode>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };

  const revoked = await digitalAccessCodeRepository.revoke(id);
  if (!revoked) return { ok: false, error: "not-found" };
  return { ok: true, data: revoked };
}

export async function updatePhysicalOrderStatus(
  id: string,
  status: PhysicalOrderStatus
): Promise<MemoryActionResult<PhysicalOrder>> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "forbidden" };

  const updated = await physicalOrderRepository.updateStatus(id, status);
  if (!updated) return { ok: false, error: "not-found" };
  return { ok: true, data: updated };
}
