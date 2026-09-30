import { getActiveFrameTemplates } from "../config/frameTemplates";
import type { MemoryCaptureMode, MemoryOutputType, MemoryProject } from "../types";

/**
 * The one policy for who may receive a Memory Project's generated output —
 * the PDF (`/api/memories/[projectId]/download`) or a share image
 * (`/api/share/memory/[projectId]/[formatId]`). Pure: callers load the
 * entitlement state (features/memories/services/outputAccess.ts) and this
 * decides, so the rules are testable without a database (see
 * `npm run db:verify`).
 *
 * Allowlist, never blocklist: an output type that isn't in OUTPUT_POLICY,
 * or a requirement this file doesn't recognize, is denied. The earlier
 * per-route `if (digital_frame) … if (personal_pdf) …` checks let every
 * other type through ungated, which is how a client-chosen `physical_gift`
 * project could reach the renderer without paying.
 */

export type MemoryOutputPurpose = "pdf" | "share";

/** What has to exist before an output is generated. */
type OutputRequirement = "pdf-unlock" | "redeemed-code" | "none" | "never";

const OUTPUT_POLICY: Record<MemoryOutputType, Record<MemoryOutputPurpose, OutputRequirement>> = {
  // 1 Token per project for the PDF; the unframed share image is the free
  // wizard's own outcome, shown before any unlock.
  personal_pdf: { pdf: "pdf-unlock", share: "none" },
  // Everything a digital_frame produces is the paid product.
  digital_frame: { pdf: "redeemed-code", share: "redeemed-code" },
  // Paid for outside MINDOT (DilekKutum) with nothing in-app to verify, so
  // the owner never gets the PDF — production reads it through the admin
  // order page. An unframed share image is the same free card any note gets.
  physical_gift: { pdf: "never", share: "none" },
};

/**
 * A frame is paid presentation. Framed output always needs a paid
 * entitlement, whatever the purpose: a framed personal_pdf (created before
 * frames were restricted to digital_frame, see validateNewMemoryProject)
 * needs its PDF unlock even to share, and a framed physical_gift — which
 * has no in-app payment at all — gets nothing.
 */
const FRAMED_REQUIREMENT: Record<MemoryOutputType, OutputRequirement> = {
  personal_pdf: "pdf-unlock",
  digital_frame: "redeemed-code",
  physical_gift: "never",
};

function isKnownOutputType(value: unknown): value is MemoryOutputType {
  return typeof value === "string" && Object.hasOwn(OUTPUT_POLICY, value);
}

export function getOutputRequirement(
  project: Pick<MemoryProject, "outputType" | "frameTemplateId">,
  purpose: MemoryOutputPurpose
): OutputRequirement {
  if (!isKnownOutputType(project.outputType)) return "never";
  const base = OUTPUT_POLICY[project.outputType][purpose] ?? "never";
  // Same "is it framed" test the renderers use (`project.frameTemplateId ? … : null`).
  if (!project.frameTemplateId || base === "never") return base;
  return base === "none" ? FRAMED_REQUIREMENT[project.outputType] : base;
}

export interface MemoryOutputPrincipal {
  id: string;
  role: string;
}

/** Loaded per project by the caller. The defaults (`null`/`false`) mean "not entitled". */
export interface MemoryEntitlementState {
  /** `memory_pdf_unlocks.user_id` for the project, if an unlock exists. */
  pdfUnlockUserId: string | null;
  hasRedeemedCode: boolean;
}

export type MemoryOutputDenial = "forbidden" | "pdf-unlock-required" | "access-not-redeemed" | "output-not-available";

export type MemoryOutputDecision = { allowed: true } | { allowed: false; reason: MemoryOutputDenial };

export function decideMemoryOutputAccess(input: {
  project: Pick<MemoryProject, "createdBy" | "outputType" | "frameTemplateId">;
  principal: MemoryOutputPrincipal;
  purpose: MemoryOutputPurpose;
  /** Download only: an admin reads any project's PDF for fulfilment. Share never bypasses. */
  adminBypass: boolean;
  state: MemoryEntitlementState;
}): MemoryOutputDecision {
  const { project, principal, purpose, adminBypass, state } = input;
  if (adminBypass && principal.role === "admin") return { allowed: true };
  if (project.createdBy !== principal.id) return { allowed: false, reason: "forbidden" };

  switch (getOutputRequirement(project, purpose)) {
    case "none":
      return { allowed: true };
    case "pdf-unlock":
      // The unlock must belong to the project's owner, not merely exist.
      return state.pdfUnlockUserId !== null && state.pdfUnlockUserId === project.createdBy
        ? { allowed: true }
        : { allowed: false, reason: "pdf-unlock-required" };
    case "redeemed-code":
      return state.hasRedeemedCode ? { allowed: true } : { allowed: false, reason: "access-not-redeemed" };
    default:
      return { allowed: false, reason: "output-not-available" };
  }
}

// ---------------------------------------------------------------------------
// Project creation
// ---------------------------------------------------------------------------

const CAPTURE_MODES: readonly MemoryCaptureMode[] = ["note_only", "note_with_surrounding"];

/** Only digital_frame is sold as framed output; every other type is created unframed. */
const FRAMED_OUTPUT_TYPES: ReadonlySet<MemoryOutputType> = new Set(["digital_frame"]);

export type NewMemoryProjectValidationError = "invalid-output-type" | "invalid-capture-mode" | "invalid-frame";

/**
 * Server-side validation of a Server Function's client-supplied project
 * options — the TypeScript types on `CreateMemoryProjectInput` don't exist
 * at runtime. The database enum accepting a value is not the same as the
 * product offering it: physical_gift is only creatable while the physical
 * flow is live (`physicalGiftAvailable`, i.e. DILEKKUTUM_URL is set — the
 * same gate the client uses before minting an order).
 */
export function validateNewMemoryProject(
  input: { outputType: unknown; captureMode: unknown; frameTemplateId?: unknown },
  options: { physicalGiftAvailable: boolean }
): NewMemoryProjectValidationError | null {
  const { outputType, captureMode, frameTemplateId } = input;
  if (!isKnownOutputType(outputType)) return "invalid-output-type";
  if (outputType === "physical_gift" && !options.physicalGiftAvailable) return "invalid-output-type";
  if (!CAPTURE_MODES.includes(captureMode as MemoryCaptureMode)) return "invalid-capture-mode";

  if (frameTemplateId === undefined || frameTemplateId === null) return null;
  if (!FRAMED_OUTPUT_TYPES.has(outputType)) return "invalid-frame";
  if (typeof frameTemplateId !== "string" || !getActiveFrameTemplates().some((t) => t.id === frameTemplateId)) {
    return "invalid-frame";
  }
  return null;
}
