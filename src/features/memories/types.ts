export type MemoryOutputType = "personal_pdf" | "digital_frame" | "physical_gift";
export type MemoryCaptureMode = "note_only" | "note_with_surrounding";
export type MemoryProjectStatus = "draft" | "ready" | "fulfilled";

/**
 * A memory project is "someone preserving a thought" — never assumed to be
 * the same person who wrote it. `createdBy` is the preserver/purchaser;
 * the message's own author is looked up separately (and, for an anonymous
 * message, never at all) — see "Message author vs memory creator" in
 * CLAUDE.md.
 */
export interface MemoryProject {
  id: string;
  messageId: string;
  createdBy: string;
  captureMode: MemoryCaptureMode;
  outputType: MemoryOutputType;
  frameTemplateId: string | null;
  status: MemoryProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export type NewMemoryProjectInput = Pick<
  MemoryProject,
  "messageId" | "createdBy" | "captureMode" | "outputType" | "frameTemplateId"
>;

export type DigitalAccessCodeStatus = "active" | "redeemed" | "expired" | "revoked";

export interface DigitalAccessCode {
  id: string;
  memoryProjectId: string | null;
  code: string;
  status: DigitalAccessCodeStatus;
  redeemedAt: string | null;
  redeemedBy: string | null;
  expiresAt: string | null;
  externalProvider: string | null;
  externalReference: string | null;
  createdAt: string;
}

export type PhysicalOrderStatus =
  | "pending"
  | "awaiting_dilekkutum_order"
  | "matched"
  | "in_production"
  | "packaged"
  | "shipped"
  | "completed"
  | "cancelled";

export interface PhysicalOrder {
  id: string;
  memoryProjectId: string;
  orderNumber: string;
  status: PhysicalOrderStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const PHYSICAL_ORDER_STATUSES: PhysicalOrderStatus[] = [
  "pending",
  "awaiting_dilekkutum_order",
  "matched",
  "in_production",
  "packaged",
  "shipped",
  "completed",
  "cancelled",
];
