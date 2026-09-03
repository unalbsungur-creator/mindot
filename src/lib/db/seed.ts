/**
 * Development seed data: one admin, one regular user, invitations in every
 * state, messages in every status (including one truly anonymous approved
 * message and one approved-but-curated-out-of-the-wall message), personal
 * wall visibility in both states, and representative Memory Project /
 * digital access-code / physical-order data — see "Development seed data"
 * in CLAUDE.md for the full rationale (EPIC 013). Safe to re-run: skips
 * seeding messages (and everything downstream of them) if any already
 * exist. Run with `npm run db:seed`.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (e.g. CI where DATABASE_URL is already set) — fine.
}

import { randomUUID } from "node:crypto";
import { computePlacement, tileForSequence, type OccupantFootprint } from "../../features/board/lib/placement";
import { estimateNoteFootprint } from "../../features/notes/lib/footprint";
import { devFallbackModerationService } from "../../features/moderation/providers/devFallback";
import { generateAccessCode, generateOrderNumber } from "../../features/memories/lib/identifiers";
import { getDb } from "./client";
import { digitalAccessCodes, invitations, memoryProjects, messages, physicalOrders, users } from "./schema";

/** Runs the real dev-fallback provider so seed data carries realistic AI fields, not hand-faked ones. */
async function aiFieldsFor(content: string, language: string) {
  const result = await devFallbackModerationService.analyzeMessage(content, { language });
  return {
    aiModerationStatus: result.decision,
    aiModerationProvider: result.provider,
    aiModerationCategories: result.categories,
    aiModerationReason: result.reason,
    aiModerationConfidence: result.confidence,
    aiModeratedAt: new Date(result.moderatedAt),
  };
}

const ADMIN_ID = "dev-admin-0001";
const USER_ID = "dev-user-0001";
// Fixed, memorable — not generated via generatePublicId() — deliberately:
// a developer testing /u/[publicId] by hand benefits far more from a
// predictable URL than from a realistic-looking random one. Real users
// still always get a random opaque id from ensurePublicId(); this is
// seed-only.
const USER_PUBLIC_ID = "devwall01";
const ADMIN_PUBLIC_ID = "devwall00";
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const db = getDb();
  const now = new Date();

  console.log("Seeding users...");
  await db
    .insert(users)
    .values([
      {
        id: ADMIN_ID,
        email: "admin@mindot.dev",
        name: "Dev Admin",
        image: null,
        role: "admin",
        publicId: ADMIN_PUBLIC_ID,
        // Left at the column default (false) — this is the seed's
        // deliberate "personal wall disabled" example (EPIC 013 section 2).
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_ID,
        email: "visitor@mindot.dev",
        name: "Dev Visitor",
        image: null,
        role: "user",
        publicId: USER_PUBLIC_ID,
        // The seed's deliberate "personal wall enabled" example.
        publicWallEnabled: true,
        publicWallDescription: "Thoughts I didn't want to keep only in my own head.",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing({ target: users.id });

  console.log("Seeding invitations...");
  const activeInvitation = {
    id: randomUUID(),
    token: "welcome-to-mindot",
    status: "active" as const,
    recipientEmail: null,
    maxUses: 1000,
    usedCount: 0,
    createdBy: ADMIN_ID,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * DAY_MS),
    usedAt: null,
    revokedAt: null,
  };
  const expiredInvitation = {
    id: randomUUID(),
    token: "expired-example",
    status: "active" as const,
    recipientEmail: null,
    maxUses: 1,
    usedCount: 0,
    createdBy: ADMIN_ID,
    createdAt: new Date(now.getTime() - 40 * DAY_MS),
    expiresAt: new Date(now.getTime() - 10 * DAY_MS),
    usedAt: null,
    revokedAt: null,
  };
  const usedInvitation = {
    id: randomUUID(),
    token: "used-up-example",
    status: "used" as const,
    recipientEmail: null,
    maxUses: 1,
    usedCount: 1,
    createdBy: ADMIN_ID,
    createdAt: new Date(now.getTime() - 5 * DAY_MS),
    expiresAt: new Date(now.getTime() + 25 * DAY_MS),
    usedAt: now,
    revokedAt: null,
  };
  const revokedInvitation = {
    id: randomUUID(),
    token: "revoked-example",
    status: "revoked" as const,
    recipientEmail: null,
    maxUses: 5,
    usedCount: 0,
    createdBy: ADMIN_ID,
    createdAt: new Date(now.getTime() - 5 * DAY_MS),
    expiresAt: new Date(now.getTime() + 25 * DAY_MS),
    usedAt: null,
    revokedAt: now,
  };

  await db
    .insert(invitations)
    .values([activeInvitation, expiredInvitation, usedInvitation, revokedInvitation])
    .onConflictDoNothing({ target: invitations.token });

  const alreadySeeded = await db.select({ id: messages.id }).from(messages).limit(1);
  if (alreadySeeded.length > 0) {
    console.log("Messages already seeded — skipping. Truncate the messages table to reseed.");
    return;
  }

  console.log("Seeding messages...");

  const pendingMessages = [
    {
      id: randomUUID(),
      content: "Every wall remembers what was written on it.",
      authorId: USER_ID,
      authorName: "a visitor",
      isAnonymous: false,
      language: "en",
      templateId: "classic-yellow",
      invitationId: activeInvitation.id,
      status: "pending" as const,
      tileX: null,
      tileY: null,
      positionX: null,
      positionY: null,
      rotation: null,
      createdAt: now,
      updatedAt: now,
      moderatedAt: null,
      moderatedBy: null,
      ...(await aiFieldsFor("Every wall remembers what was written on it.", "en")),
    },
    {
      id: randomUUID(),
      content: "Bugün küçük bir şey için minnettarım.",
      authorId: USER_ID,
      authorName: "anonymous",
      isAnonymous: true,
      language: "tr",
      templateId: "warm-cream",
      invitationId: null,
      status: "pending" as const,
      tileX: null,
      tileY: null,
      positionX: null,
      positionY: null,
      rotation: null,
      createdAt: now,
      updatedAt: now,
      moderatedAt: null,
      moderatedBy: null,
      ...(await aiFieldsFor("Bugün küçük bir şey için minnettarım.", "tr")),
    },
    {
      id: randomUUID(),
      content: "Check this out http://example.com/deal !!!!!!!!",
      authorId: USER_ID,
      authorName: "anonymous",
      isAnonymous: true,
      language: "en",
      templateId: "kraft-tag",
      invitationId: null,
      status: "pending" as const,
      tileX: null,
      tileY: null,
      positionX: null,
      positionY: null,
      rotation: null,
      createdAt: now,
      updatedAt: now,
      moderatedAt: null,
      moderatedBy: null,
      // Demonstrates the "blocked" heuristic path (repeated characters).
      ...(await aiFieldsFor("Check this out http://example.com/deal !!!!!!!!", "en")),
    },
  ];

  const rejectedMessages = [
    {
      id: randomUUID(),
      content: "[Example content that a moderator decided not to approve.]",
      authorId: USER_ID,
      authorName: "anonymous",
      isAnonymous: true,
      language: "en",
      templateId: "minimal-white",
      invitationId: null,
      status: "rejected" as const,
      tileX: null,
      tileY: null,
      positionX: null,
      positionY: null,
      rotation: null,
      createdAt: now,
      updatedAt: now,
      moderatedAt: now,
      moderatedBy: ADMIN_ID,
      ...(await aiFieldsFor("[Example content that a moderator decided not to approve.]", "en")),
    },
  ];

  // Sequence numbers deliberately span several 36-slot tiles (see
  // computePlacement) so seeded approvals demonstrate more than one tile.
  // seq 120 and 121 deliberately land in the *same* tile (120/36 and
  // 121/36 both floor to tile-index 3) so "surrounding note capture" is
  // reproducible without hand-picking placement — see the memory project
  // seeded below, which uses exactly this pair.
  const approvedSeeds = [
    { seq: 0, content: "A thought pinned here finally gets to exhale.", authorName: "a passerby", isAnonymous: false, showOnPersonalWall: true, language: "en", templateId: "classic-yellow" },
    { seq: 40, content: "Her düşüncenin duvarda bir yeri var.", authorName: "a dreamer", isAnonymous: false, showOnPersonalWall: true, language: "tr", templateId: "torn-kraft" },
    // The seed's deliberate "approved anonymous message" example — real
    // submitMessage() always discards the client-sent name and stores the
    // literal "anonymous" author name once isAnonymous is true; mirrored
    // here rather than hand-faking a different shape.
    { seq: 80, content: "Jeder Gedanke verdient einen Platz an der Wand.", authorName: "anonymous", isAnonymous: true, showOnPersonalWall: true, language: "de", templateId: "mint-square" },
    { seq: 120, content: "Chaque pensée mérite une place sur le mur.", authorName: "a quiet optimist", isAnonymous: false, showOnPersonalWall: true, language: "fr", templateId: "pink-square" },
    // The seed's deliberate "named + approved but excluded from the
    // personal wall" example — eligible (approved, named) but curated out.
    { seq: 121, content: "Todo pensamiento merece un lugar en el muro.", authorName: "a friend you haven't met", isAnonymous: false, showOnPersonalWall: false, language: "es", templateId: "polaroid" },
  ];

  // Sequential (not Promise.all) so seq 120/121 — deliberately sharing a
  // tile, see the comment above — resolve their positions collision-aware
  // against each other, the same way messages/repository.ts's approve()
  // does against real occupants already in a tile.
  const occupantsByTile = new Map<string, OccupantFootprint[]>();
  const approvedMessages = [];
  for (const { seq, ...rest } of approvedSeeds) {
    const id = randomUUID();
    const footprint = estimateNoteFootprint(rest.templateId, rest.content);
    const { tileX, tileY } = tileForSequence(seq);
    const tileKey = `${tileX},${tileY}`;
    const occupants = occupantsByTile.get(tileKey) ?? [];
    const placement = computePlacement(seq, id, footprint, occupants);
    occupantsByTile.set(tileKey, [
      ...occupants,
      { positionX: placement.positionX, positionY: placement.positionY, rotation: placement.rotation, ...footprint },
    ]);

    approvedMessages.push({
      id,
      content: rest.content,
      authorId: USER_ID,
      authorName: rest.authorName,
      isAnonymous: rest.isAnonymous,
      showOnPersonalWall: rest.showOnPersonalWall,
      language: rest.language,
      templateId: rest.templateId,
      invitationId: null,
      status: "approved" as const,
      tileX: placement.tileX,
      tileY: placement.tileY,
      positionX: placement.positionX,
      positionY: placement.positionY,
      rotation: placement.rotation,
      createdAt: now,
      updatedAt: now,
      moderatedAt: now,
      moderatedBy: ADMIN_ID,
      ...(await aiFieldsFor(rest.content, rest.language)),
    });
  }

  await db.insert(messages).values([...pendingMessages, ...rejectedMessages, ...approvedMessages]);

  // approvedMessages[0]=seq0 (personal_pdf), [1]=seq40 (digital_frame,
  // already unlocked), [3]=seq120 (digital_frame, still locked — its
  // access code is issued but not redeemed, so a developer can redeem it
  // by hand through the real UI), [4]=seq121 (physical_gift, mid-fulfilment).
  const [passerbyMessage, dreamerMessage, , optimistMessage, friendMessage] = approvedMessages;

  console.log("Seeding Memory Projects, digital access codes, and physical orders...");

  const personalPdfProject = {
    id: randomUUID(),
    messageId: passerbyMessage.id,
    createdBy: USER_ID,
    captureMode: "note_only" as const,
    outputType: "personal_pdf" as const,
    frameTemplateId: null,
    status: "draft" as const,
    createdAt: now,
    updatedAt: now,
  };

  const digitalFrameUnlockedProject = {
    id: randomUUID(),
    messageId: dreamerMessage.id,
    createdBy: USER_ID,
    captureMode: "note_only" as const,
    outputType: "digital_frame" as const,
    frameTemplateId: "classic-paper",
    status: "draft" as const,
    createdAt: now,
    updatedAt: now,
  };

  const digitalFrameLockedProject = {
    id: randomUUID(),
    messageId: optimistMessage.id,
    createdBy: USER_ID,
    // Exercises the "note_with_surrounding" capture path — seq120 and
    // seq121 above share a tile, so this pulls in a real surrounding note.
    captureMode: "note_with_surrounding" as const,
    outputType: "digital_frame" as const,
    frameTemplateId: "premium-edition",
    status: "draft" as const,
    createdAt: now,
    updatedAt: now,
  };

  const physicalGiftProject = {
    id: randomUUID(),
    messageId: friendMessage.id,
    createdBy: USER_ID,
    captureMode: "note_only" as const,
    outputType: "physical_gift" as const,
    frameTemplateId: null,
    status: "draft" as const,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .insert(memoryProjects)
    .values([personalPdfProject, digitalFrameUnlockedProject, digitalFrameLockedProject, physicalGiftProject]);

  // Four digital access codes, one per DigitalAccessCodeStatus value.
  const redeemedCode = generateAccessCode();
  const unredeemedCode = generateAccessCode();
  const revokedCode = generateAccessCode();
  const expiredCode = generateAccessCode();

  await db.insert(digitalAccessCodes).values([
    {
      id: randomUUID(),
      memoryProjectId: digitalFrameUnlockedProject.id,
      code: redeemedCode,
      status: "redeemed",
      redeemedAt: now,
      redeemedBy: USER_ID,
      expiresAt: null,
      externalProvider: "manual",
      externalReference: "seed-redeemed",
      createdAt: now,
    },
    {
      // Deliberately unassigned (memoryProjectId: null) — mirrors how a
      // real code is issued before anyone redeems it. Printed below so a
      // developer can redeem it by hand against digitalFrameLockedProject
      // through the real /memory/[messageId] UI.
      id: randomUUID(),
      memoryProjectId: null,
      code: unredeemedCode,
      status: "active",
      redeemedAt: null,
      redeemedBy: null,
      expiresAt: null,
      externalProvider: "manual",
      externalReference: "seed-active-unassigned",
      createdAt: now,
    },
    {
      id: randomUUID(),
      memoryProjectId: null,
      code: revokedCode,
      status: "revoked",
      redeemedAt: null,
      redeemedBy: null,
      expiresAt: null,
      externalProvider: "manual",
      externalReference: "seed-revoked",
      createdAt: now,
    },
    {
      id: randomUUID(),
      memoryProjectId: null,
      code: expiredCode,
      status: "expired",
      redeemedAt: null,
      redeemedBy: null,
      expiresAt: new Date(now.getTime() - DAY_MS),
      externalProvider: "manual",
      externalReference: "seed-expired",
      createdAt: new Date(now.getTime() - 30 * DAY_MS),
    },
  ]);

  const physicalOrderNumber = generateOrderNumber();
  await db.insert(physicalOrders).values([
    {
      id: randomUUID(),
      memoryProjectId: physicalGiftProject.id,
      orderNumber: physicalOrderNumber,
      // Mid-fulfilment on purpose, not "pending" — so the admin order list
      // starts from a non-trivial state and a developer can exercise the
      // remaining status transitions by hand from there.
      status: "in_production",
      createdBy: USER_ID,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const tileCount = new Set(approvedMessages.map((m) => `${m.tileX},${m.tileY}`)).size;
  console.log("Seed complete.");
  console.log("");
  console.log("  IMPORTANT: admin@mindot.dev / visitor@mindot.dev are backing data only —");
  console.log("  their ids are not real Google accounts, so you cannot sign in as them.");
  console.log("  To test as admin, set ADMIN_EMAILS in .env.local to YOUR OWN Google");
  console.log("  account's email, then sign in with Google — your real account becomes");
  console.log("  admin on that first sign-in.");
  console.log("");
  console.log(`  Invitations: /invite/${activeInvitation.token} (active) /invite/${expiredInvitation.token} (expired)`);
  console.log(`               /invite/${usedInvitation.token} (used) /invite/${revokedInvitation.token} (revoked)`);
  console.log(`  Messages: ${pendingMessages.length} pending, ${rejectedMessages.length} rejected, ${approvedMessages.length} approved across ${tileCount} tiles`);
  console.log(`  Personal walls: /u/${USER_PUBLIC_ID} (enabled, one message curated out) — /u/${ADMIN_PUBLIC_ID} (disabled)`);
  console.log(`  Memory Projects: personal_pdf (${passerbyMessage.content.slice(0, 24)}…), digital_frame ×2, physical_gift`);
  console.log(`  Digital access codes — redeemed: ${redeemedCode} · active/unassigned: ${unredeemedCode} (redeem this one by hand) · revoked: ${revokedCode} · expired: ${expiredCode}`);
  console.log(`  Physical order: ${physicalOrderNumber} (status: in_production) — /admin/orders/${physicalOrderNumber}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
