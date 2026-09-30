/**
 * Automated privacy/ownership regression check — EPIC 013 section 5.
 * Exercises the real repository layer (never a parallel/shortcut query
 * path) against whatever database DATABASE_URL points at, and asserts the
 * invariants CLAUDE.md documents as load-bearing. Written to run against
 * the seeded dev dataset (`npm run db:seed`) — some checks are skipped
 * with a warning if the specific seed row they depend on isn't found,
 * rather than failing on a database that was never seeded.
 *
 * This does not replace server-side authorization anywhere — it only
 * reads back through the same repository methods every route already
 * uses, to catch a regression in those methods themselves.
 *
 * Run with: npm run db:verify
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine, DATABASE_URL may already be set in the environment.
}

import { getPublicMessageById, getTile } from "../../features/board/repository";
import {
  decideMemoryOutputAccess,
  validateNewMemoryProject,
  type MemoryEntitlementState,
  type MemoryOutputDecision,
  type MemoryOutputDenial,
  type MemoryOutputPurpose,
} from "../../features/memories/lib/outputPolicy";
import { digitalAccessCodeRepository, memoryRepository, physicalOrderRepository } from "../../features/memories/repository";
import { checkMemoryOutputAccess } from "../../features/memories/services/outputAccess";
import type { MemoryOutputType } from "../../features/memories/types";
import { messageRepository } from "../../features/messages/repository";
import { getPublicWall } from "../../features/profile/repository";

const ADMIN_ID = "dev-admin-0001";
const USER_ID = "dev-user-0001";
const USER_PUBLIC_ID = "devwall01";
const ADMIN_PUBLIC_ID = "devwall00";

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function pass(label: string) {
  console.log(`  [PASS] ${label}`);
  passCount++;
}

function fail(label: string, detail?: string) {
  console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  failCount++;
}

function skip(label: string, reason: string) {
  console.warn(`  [SKIP] ${label} — ${reason}`);
  skipCount++;
}

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) pass(label);
  else fail(label, detail);
}

async function main() {
  console.log("MINDOT privacy/ownership verification\n");

  // ---------------------------------------------------------------------
  // 1. Anonymous authorship never reaches public output.
  // ---------------------------------------------------------------------
  console.log("Anonymous privacy:");
  const userMessages = await messageRepository.listByAuthor(USER_ID, { limit: 100 });
  const anonymousApproved = userMessages.find((m) => m.status === "approved" && m.isAnonymous);
  if (!anonymousApproved) {
    skip("anonymous message never public (board)", "no approved+anonymous seed row found — run npm run db:seed");
    skip("anonymous message never public (personal wall)", "same as above");
  } else {
    const tile = await getTile(anonymousApproved.tileX!, anonymousApproved.tileY!);
    const onBoard = tile.messages.find((m) => m.id === anonymousApproved.id);
    assert(onBoard !== undefined, "anonymous message appears on the board");
    assert(onBoard?.author === null, "anonymous message's board author is null", JSON.stringify(onBoard?.author));

    const publicDetail = await getPublicMessageById(anonymousApproved.id);
    assert(publicDetail?.author === null, "anonymous message's getPublicMessageById author is null");

    const wall = await getPublicWall(USER_PUBLIC_ID);
    const onWall = wall.status === "ok" ? wall.notes.some((n) => n.id === anonymousApproved.id) : false;
    assert(onWall === false, "anonymous message never appears on the personal wall");
  }

  // ---------------------------------------------------------------------
  // 2. Pending/rejected never public.
  // ---------------------------------------------------------------------
  console.log("\nPending/rejected privacy:");
  const pending = userMessages.find((m) => m.status === "pending");
  const rejected = userMessages.find((m) => m.status === "rejected");
  if (pending) {
    const detail = await getPublicMessageById(pending.id);
    assert(detail === null, "pending message is not publicly readable");
  } else {
    skip("pending message not public", "no pending seed row found");
  }
  if (rejected) {
    const detail = await getPublicMessageById(rejected.id);
    assert(detail === null, "rejected message is not publicly readable");
  } else {
    skip("rejected message not public", "no rejected seed row found");
  }

  // ---------------------------------------------------------------------
  // 3. showOnPersonalWall curation is enforced at the query level.
  // ---------------------------------------------------------------------
  console.log("\nPersonal wall curation:");
  const curatedOut = userMessages.find((m) => m.status === "approved" && !m.isAnonymous && !m.showOnPersonalWall);
  if (!curatedOut) {
    skip("curated-out message excluded from wall", "no approved+named+showOnPersonalWall=false seed row found");
  } else {
    const wall = await getPublicWall(USER_PUBLIC_ID);
    const onWall = wall.status === "ok" ? wall.notes.some((n) => n.id === curatedOut.id) : false;
    assert(onWall === false, "curated-out (showOnPersonalWall=false) message excluded from the personal wall");
  }

  // ---------------------------------------------------------------------
  // 4. Personal wall enabled/disabled gating.
  // ---------------------------------------------------------------------
  console.log("\nPersonal wall visibility:");
  const disabledWall = await getPublicWall(ADMIN_PUBLIC_ID);
  assert(disabledWall.status === "disabled" || disabledWall.status === "not-found", "disabled wall never returns 'ok'", disabledWall.status);
  if (disabledWall.status === "ok") {
    fail("disabled wall must never expose notes"); // unreachable given the assert above, but explicit for clarity.
  }

  const enabledWall = await getPublicWall(USER_PUBLIC_ID);
  assert(enabledWall.status === "ok", "enabled wall returns 'ok'", enabledWall.status);

  // ---------------------------------------------------------------------
  // 5. Digital access-code lifecycle: single-use, revoked, expired.
  // ---------------------------------------------------------------------
  console.log("\nDigital access codes:");
  const allCodes = await digitalAccessCodeRepository.list();
  const redeemed = allCodes.find((c) => c.status === "redeemed");
  const revoked = allCodes.find((c) => c.status === "revoked");
  const expired = allCodes.find((c) => c.status === "expired");
  const projects = await memoryRepository.listByCreator(USER_ID);
  const anyOtherProject = projects.find((p) => p.id !== redeemed?.memoryProjectId);

  if (redeemed && anyOtherProject) {
    const reReemed = await digitalAccessCodeRepository.redeem(redeemed.code, anyOtherProject.id, USER_ID);
    assert(reReemed === null, "an already-redeemed code cannot be redeemed again against a different project");
  } else {
    skip("redeemed code cannot be reused", "no redeemed code + spare project found in seed data");
  }
  if (revoked) {
    const result = await digitalAccessCodeRepository.redeem(revoked.code, projects[0]?.id ?? "nonexistent", USER_ID);
    assert(result === null, "a revoked code cannot be redeemed");
  } else {
    skip("revoked code cannot be redeemed", "no revoked code found in seed data");
  }
  if (expired) {
    const result = await digitalAccessCodeRepository.redeem(expired.code, projects[0]?.id ?? "nonexistent", USER_ID);
    assert(result === null, "an expired code cannot be redeemed");
  } else {
    skip("expired code cannot be redeemed", "no expired code found in seed data");
  }

  // ---------------------------------------------------------------------
  // 6. Memory Project / physical order ownership scoping.
  // ---------------------------------------------------------------------
  console.log("\nOwnership scoping:");
  const adminProjects = await memoryRepository.listByCreator(ADMIN_ID);
  assert(adminProjects.length === 0, "the admin dev user owns none of the visitor's seeded Memory Projects", `found ${adminProjects.length}`);

  const adminOrders = await physicalOrderRepository.listByCreator(ADMIN_ID);
  assert(adminOrders.length === 0, "the admin dev user owns none of the visitor's seeded physical orders", `found ${adminOrders.length}`);

  const userOrders = await physicalOrderRepository.listByCreator(USER_ID);
  if (userOrders.length > 0) {
    const order = userOrders[0];
    const byNumber = await physicalOrderRepository.getByOrderNumber(order.orderNumber);
    assert(byNumber?.id === order.id, "physical order is resolvable by its own order number");
  } else {
    skip("physical order resolvable by order number", "no seeded physical order found");
  }

  // ---------------------------------------------------------------------
  // 7. Memory output entitlement policy (download + share). Pure fixture
  //    state first — no token, unlock, or access-code row is written.
  // ---------------------------------------------------------------------
  console.log("\nMemory output entitlement:");
  const owner = { id: "policy-owner", role: "user" };
  const stranger = { id: "policy-stranger", role: "user" };
  const admin = { id: "policy-admin", role: "admin" };
  const none: MemoryEntitlementState = { pdfUnlockUserId: null, hasRedeemedCode: false };
  const everything: MemoryEntitlementState = { pdfUnlockUserId: owner.id, hasRedeemedCode: true };
  const project = (outputType: string, frameTemplateId: string | null = null) => ({
    createdBy: owner.id,
    outputType: outputType as MemoryOutputType,
    frameTemplateId,
  });
  const decide = (
    p: ReturnType<typeof project>,
    purpose: MemoryOutputPurpose,
    state: MemoryEntitlementState,
    principal = owner,
    adminBypass = purpose === "pdf"
  ) => decideMemoryOutputAccess({ project: p, principal, purpose, adminBypass, state });
  const denied = (d: MemoryOutputDecision, reason: MemoryOutputDenial) => !d.allowed && d.reason === reason;

  assert(denied(decide(project("personal_pdf"), "pdf", none), "pdf-unlock-required"), "personal_pdf without unlock: PDF denied");
  assert(decide(project("personal_pdf"), "pdf", everything).allowed, "personal_pdf with the owner's unlock: PDF allowed");
  assert(
    denied(decide(project("personal_pdf"), "pdf", { ...none, pdfUnlockUserId: stranger.id }), "pdf-unlock-required"),
    "personal_pdf with someone else's unlock: PDF denied"
  );
  assert(denied(decide(project("digital_frame", "classic-paper"), "pdf", none), "access-not-redeemed"), "digital_frame without redeemed code: PDF denied");
  assert(decide(project("digital_frame", "classic-paper"), "pdf", everything).allowed, "digital_frame with redeemed code: PDF allowed");
  assert(
    denied(decide(project("physical_gift", "premium-edition"), "pdf", everything), "output-not-available"),
    "physical_gift + premium-edition: PDF denied even with every entitlement present"
  );
  assert(denied(decide(project("physical_gift"), "pdf", everything), "output-not-available"), "physical_gift: owner never gets the PDF");
  assert(denied(decide(project("gift_card"), "pdf", everything), "output-not-available"), "unknown outputType: PDF denied");
  assert(denied(decide(project("gift_card"), "share", everything), "output-not-available"), "unknown outputType: share denied");
  assert(
    denied(decide(project("physical_gift", "premium-edition"), "share", everything), "output-not-available"),
    "share physical_gift + premium-edition: denied"
  );
  assert(decide(project("physical_gift"), "share", none).allowed, "share unframed physical_gift: allowed (free card)");
  assert(decide(project("personal_pdf"), "share", none).allowed, "share unframed personal_pdf without unlock: allowed (free wizard outcome)");
  assert(
    denied(decide(project("personal_pdf", "premium-edition"), "share", none), "pdf-unlock-required"),
    "share framed personal_pdf without unlock: denied"
  );
  assert(decide(project("personal_pdf", "premium-edition"), "share", everything).allowed, "share framed personal_pdf with unlock: allowed");
  assert(
    denied(decide(project("digital_frame", "premium-edition"), "share", none), "access-not-redeemed"),
    "share digital_frame without redeemed code: denied"
  );
  assert(decide(project("digital_frame", "premium-edition"), "share", everything).allowed, "share digital_frame with redeemed code: allowed");
  for (const purpose of ["pdf", "share"] as const) {
    assert(
      denied(decide(project("personal_pdf"), purpose, everything, stranger), "forbidden"),
      `cross-user: another user's project denied (${purpose})`
    );
  }
  assert(decide(project("physical_gift", "premium-edition"), "pdf", none, admin).allowed, "admin: PDF bypass preserved for fulfilment");
  assert(denied(decide(project("digital_frame", "premium-edition"), "share", everything, admin), "forbidden"), "admin: no share bypass");

  const live = { physicalGiftAvailable: true };
  const notLive = { physicalGiftAvailable: false };
  const validate = (input: { outputType: unknown; captureMode?: unknown; frameTemplateId?: unknown }, options = live) =>
    validateNewMemoryProject({ captureMode: "note_only", ...input }, options);
  assert(validate({ outputType: "personal_pdf" }) === null, "create: personal_pdf without frame accepted");
  assert(validate({ outputType: "digital_frame", frameTemplateId: "premium-edition" }) === null, "create: digital_frame + premium-edition accepted");
  assert(validate({ outputType: "physical_gift", frameTemplateId: "premium-edition" }) === "invalid-frame", "create: physical_gift + premium-edition rejected");
  assert(validate({ outputType: "personal_pdf", frameTemplateId: "premium-edition" }) === "invalid-frame", "create: personal_pdf + frame rejected");
  assert(validate({ outputType: "digital_frame", frameTemplateId: "no-such-frame" }) === "invalid-frame", "create: unknown frame rejected");
  assert(validate({ outputType: "gift_card" }) === "invalid-output-type", "create: unknown outputType rejected");
  assert(validate({ outputType: "physical_gift" }, notLive) === "invalid-output-type", "create: physical_gift rejected while the physical flow isn't live");
  assert(validate({ outputType: "physical_gift" }, live) === null, "create: unframed physical_gift accepted once live");
  assert(validate({ outputType: "personal_pdf", captureMode: "whole_board" }) === "invalid-capture-mode", "create: unknown captureMode rejected");

  // Real loader against seeded projects — read-only.
  const seededByType = (type: MemoryOutputType) => projects.filter((p) => p.outputType === type);
  const visitor = { id: USER_ID, role: "user" };
  const seededGift = seededByType("physical_gift")[0];
  if (seededGift) {
    const access = await checkMemoryOutputAccess(seededGift, visitor, "pdf", { adminBypass: true });
    assert(!access.allowed, "seeded physical_gift: owner PDF denied through the real loader");
  } else {
    skip("seeded physical_gift PDF denied", "no seeded physical_gift project found");
  }
  const seededFrames = seededByType("digital_frame");
  if (seededFrames.length > 0) {
    for (const frameProject of seededFrames) {
      const redeemedCode = await digitalAccessCodeRepository.hasRedeemedCodeForProject(frameProject.id);
      const access = await checkMemoryOutputAccess(frameProject, visitor, "share", { adminBypass: false });
      assert(access.allowed === redeemedCode, `seeded digital_frame: share allowed exactly when its code is redeemed (${redeemedCode})`);
    }
  } else {
    skip("seeded digital_frame share gated by code", "no seeded digital_frame project found");
  }

  console.log(`\n${passCount} passed, ${failCount} failed, ${skipCount} skipped.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Verification script crashed:", error);
  process.exit(1);
});
