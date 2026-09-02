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
import { digitalAccessCodeRepository, memoryRepository, physicalOrderRepository } from "../../features/memories/repository";
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

  console.log(`\n${passCount} passed, ${failCount} failed, ${skipCount} skipped.`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Verification script crashed:", error);
  process.exit(1);
});
