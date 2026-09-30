import {
  decideMemoryOutputAccess,
  getOutputRequirement,
  type MemoryEntitlementState,
  type MemoryOutputDecision,
  type MemoryOutputPrincipal,
  type MemoryOutputPurpose,
} from "../lib/outputPolicy";
import { digitalAccessCodeRepository, memoryPdfUnlockRepository } from "../repository";
import type { MemoryProject } from "../types";

/**
 * Loads exactly the entitlement state `project` needs for `purpose` and
 * applies the shared output policy (lib/outputPolicy.ts). The one check
 * both output routes call before generating anything — never re-implement
 * per-outputType branches in a route.
 */
export async function checkMemoryOutputAccess(
  project: MemoryProject,
  principal: MemoryOutputPrincipal,
  purpose: MemoryOutputPurpose,
  options: { adminBypass: boolean }
): Promise<MemoryOutputDecision> {
  const state: MemoryEntitlementState = { pdfUnlockUserId: null, hasRedeemedCode: false };

  const bypassed = options.adminBypass && principal.role === "admin";
  if (!bypassed && project.createdBy === principal.id) {
    const requirement = getOutputRequirement(project, purpose);
    if (requirement === "pdf-unlock") {
      state.pdfUnlockUserId = (await memoryPdfUnlockRepository.getByProjectId(project.id))?.userId ?? null;
    } else if (requirement === "redeemed-code") {
      state.hasRedeemedCode = await digitalAccessCodeRepository.hasRedeemedCodeForProject(project.id);
    }
  }

  return decideMemoryOutputAccess({ project, principal, purpose, adminBypass: options.adminBypass, state });
}
