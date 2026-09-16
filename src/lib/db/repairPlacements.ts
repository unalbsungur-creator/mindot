/**
 * EPIC 049: scans every approved message for genuine board-placement
 * collisions and repairs only the ones that actually have one — a
 * maintenance script in the same family as `db:seed`/`db:verify`, run
 * on-demand (`npm run db:repair-placements`), never automatically on a
 * request path.
 *
 * "A published note's placement is permanent" (CLAUDE.md, pre-EPIC-049)
 * meant "never recomputed for cosmetic/algorithm-improvement reasons" — it
 * was never meant to protect a placement that is measurably, geometrically
 * broken (two notes' real rendered boxes overlapping). EPIC 049 makes that
 * explicit: a persisted `positionX`/`positionY` is only ever touched here
 * if `repairTileCollisions` (features/board/lib/repairCollisions.ts) — the
 * exact same rotation-aware, decorative-overflow-inflated, `MIN_GAP_PX`
 * geometry `computePlacement` already uses for brand-new approvals —
 * proves it collides with another message already accepted in the same
 * tile. `tileX`/`tileY`/`rotation` and every non-placement field
 * (content, author, fontFamily, templateId, likeCount, moderation status,
 * timestamps) are never read into the update at all, let alone written —
 * `repositionPlacement` (messages/repository.ts) only accepts an id plus a
 * new x/y, structurally incapable of touching anything else.
 *
 * Deterministic and idempotent: messages within a tile are always
 * processed oldest-approved-first (ties broken by id), so a message
 * approved earlier is always the "anchor" a later, colliding one yields to
 * — never the other way around — and re-running this script against a
 * tile it already repaired (or one that was already fine) makes zero
 * writes, since `repairTileCollisions` only ever reports a change for a
 * genuine, currently-existing collision.
 *
 * EPIC 050 (Step 2, added below the original collision pass): a message
 * can be perfectly collision-free and still be unreachable, if its tile is
 * far outside anywhere a real default `/board` visit would ever load it
 * from — confirmed as a real, reproducible condition in this project's own
 * database (two approved messages, `moderatedAt` in the same few minutes,
 * both landed in tile (4,-5) — over 4000px from the origin the default
 * camera always opens on — from a `message_placement_seq` that had
 * drifted far ahead before a later `db:recalibrate-sequence` run pulled it
 * back down; their own tiles were never touched by anything after they
 * were originally placed). This reuses the exact same `findEmptyTile`/
 * `resolveCollisionFreePosition` primitives as Step 1 and new-approval
 * overflow handling — never a second reachability or placement algorithm —
 * and is equally idempotent: a message already inside the reachable set
 * `computeReachableTileKeys` computes is left completely untouched,
 * including its rotation, on every run.
 *
 * Run with: npm run db:repair-placements
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine, DATABASE_URL may already be set in the environment.
}

import { getDb } from "./client";
import { messages } from "./schema";
import { eq } from "drizzle-orm";
import { findEmptyTile, hasCollision, resolveCollisionFreePosition, type OccupantFootprint } from "../../features/board/lib/placement";
import { estimateNoteFootprint } from "../../features/notes/lib/footprint";
import { messageRepository } from "../../features/messages/repository";
import { repairTileCollisions, type RepairableOccupant } from "../../features/board/lib/repairCollisions";
import type { NoteTextFontFamily } from "../../features/notes/types";
import { BOARD_REFERENCE_MESSAGE_ID, DEFAULT_ZOOM, TILE_PX, boardReferencePoint, visibleTileRange } from "../../features/board/lib/worldGeometry";

/**
 * EPIC 050: representative viewport sizes — from a small phone to a large
 * desktop monitor — used only to compute which tiles the *default* camera
 * position could ever load, never to render anything. `visibleTileRange`
 * (features/board/lib/worldGeometry.ts) is the exact same function
 * `useTileCache` calls on a real page load; reusing it here (rather than
 * inventing a second "is this tile too far" formula) means this reachable
 * set can never silently drift from what the real board actually fetches.
 */
const REPRESENTATIVE_VIEWPORTS: { width: number; height: number }[] = [
  { width: 360, height: 640 }, // small phone
  { width: 768, height: 1024 }, // tablet
  { width: 1280, height: 800 }, // small laptop
  { width: 1920, height: 1080 }, // common desktop
  { width: 2560, height: 1440 }, // large desktop
];

/**
 * Every tile the default camera position could load on a first visit,
 * across every representative viewport size above — the union, since a
 * message only needs to be reachable from *some* real device's default
 * view, not literally all of them. `approvedIds` decides the camera the
 * exact same way `resolveBoardCenterPoint` (worldGeometry.ts) already does
 * for the real page: the reference message's own coordinate if it's still
 * live, the shared `(TILE_PX/2, TILE_PX/2)` fallback otherwise — computed
 * here without a second query since the caller already has every approved
 * row in memory.
 */
function computeReachableTileKeys(approvedIds: Set<string>): Set<string> {
  const center = approvedIds.has(BOARD_REFERENCE_MESSAGE_ID) ? boardReferencePoint() : { x: TILE_PX / 2, y: TILE_PX / 2 };
  const camera = { ...center, zoom: DEFAULT_ZOOM };
  const keys = new Set<string>();
  for (const viewport of REPRESENTATIVE_VIEWPORTS) {
    for (const tile of visibleTileRange(camera, viewport.width, viewport.height)) {
      keys.add(`${tile.x},${tile.y}`);
    }
  }
  return keys;
}

function countCollisionPairs(occupants: OccupantFootprint[]): number {
  let pairs = 0;
  for (let i = 0; i < occupants.length; i++) {
    for (let j = i + 1; j < occupants.length; j++) {
      if (hasCollision(occupants[i], occupants[j])) pairs++;
    }
  }
  return pairs;
}

/** Every occupant that's part of at least one currently-colliding pair — the residual set an in-tile repair couldn't clear, and therefore the only candidates `main()` ever considers migrating to an empty tile. */
function findCollidingIds(occupants: RepairableOccupant[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < occupants.length; i++) {
    for (let j = i + 1; j < occupants.length; j++) {
      if (hasCollision(occupants[i], occupants[j])) {
        ids.add(occupants[i].id);
        ids.add(occupants[j].id);
      }
    }
  }
  return ids;
}

async function main() {
  const db = getDb();
  // Every approved message, unbounded — a repair pass that silently
  // skipped rows past some default page size would be worse than useless
  // here. This project's message volume is small enough in practice
  // (documented precedent throughout CLAUDE.md) that one unbounded scan is
  // the right tool, not a reason to build pagination for a maintenance
  // script that's run by hand.
  const rows = await db.select().from(messages).where(eq(messages.status, "approved"));
  console.log(`Scanned ${rows.length} approved message(s).`);

  const byTile = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.tileX === null || row.tileY === null || row.positionX === null || row.positionY === null || row.rotation === null) {
      continue; // Approved but not yet placed — shouldn't happen, skip defensively rather than crash.
    }
    const key = `${row.tileX},${row.tileY}`;
    if (!byTile.has(key)) byTile.set(key, [] as typeof rows);
    (byTile.get(key) as typeof rows).push(row);
  }
  console.log(`Across ${byTile.size} occupied tile(s).`);

  const occupiedTileKeys = new Set(byTile.keys());
  // Tracks each message's *current* tile as this script mutates it — Step 1
  // below may migrate a message to a new tile, and Step 2 (unreachable-
  // placement normalization) must check against that current tile, never
  // the stale snapshot `rows` was read with.
  const messageTile = new Map<string, { tileX: number; tileY: number }>();
  for (const row of rows) {
    if (row.tileX !== null && row.tileY !== null) messageTile.set(row.id, { tileX: row.tileX, tileY: row.tileY });
  }
  let totalBefore = 0;
  let totalAfter = 0;
  let repositionedCount = 0;
  let migratedCount = 0;

  for (const [tileKey, tileRows] of byTile) {
    const occupants: RepairableOccupant[] = tileRows.map((row) => ({
      id: row.id,
      positionX: row.positionX!,
      positionY: row.positionY!,
      rotation: row.rotation!,
      ...estimateNoteFootprint(row.templateId, row.content, row.fontFamily as NoteTextFontFamily),
    }));

    const before = countCollisionPairs(occupants);
    totalBefore += before;
    if (before === 0) continue;

    // Deterministic processing order: earliest-approved first (ties by id)
    // — see this file's own doc comment for why this direction, never
    // content/createdAt/anything that could change between runs.
    const ordered = [...occupants].sort((a, b) => {
      const rowA = tileRows.find((r) => r.id === a.id)!;
      const rowB = tileRows.find((r) => r.id === b.id)!;
      const timeA = rowA.moderatedAt ? new Date(rowA.moderatedAt).getTime() : 0;
      const timeB = rowB.moderatedAt ? new Date(rowB.moderatedAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const changes = repairTileCollisions(ordered);
    console.log(`  Tile ${tileKey}: ${before} colliding pair(s) among ${occupants.length} card(s) -> repositioning ${changes.length} card(s).`);

    for (const change of changes) {
      const updated = await messageRepository.repositionPlacement(change.id, change.positionX, change.positionY);
      if (!updated) {
        console.warn(`    [WARN] repositionPlacement returned null for ${change.id} (no longer approved?).`);
        continue;
      }
      repositionedCount++;
    }

    // Re-measure with the now-persisted positions — a real, verified state
    // rather than trusting the repair function's own change list blindly.
    let currentOccupants: RepairableOccupant[] = occupants.map((o) => {
      const change = changes.find((c) => c.id === o.id);
      return change ? { ...o, positionX: change.positionX, positionY: change.positionY } : o;
    });

    // EPIC 049: this tile hosted more real occupants than SLOTS_PER_TILE
    // was ever designed to guarantee collision-free packing for (a legacy
    // artifact of the pre-EPIC-047 SLOTS_PER_TILE=36 era) — in-tile
    // relaxation alone couldn't clear every collision no matter how many
    // sweeps it ran. Rather than leave a real, measured overlap in place
    // (unacceptable per this EPIC's own acceptance criteria), migrate the
    // still-colliding occupants — deterministically, most-recently-approved
    // first, so the earliest-approved cards in a crowded tile are always
    // the ones that keep their spot — one at a time to a tile with zero
    // other occupants, which is collision-free by construction.
    const residualIds = findCollidingIds(currentOccupants);
    if (residualIds.size > 0) {
      const residualInOrder = [...residualIds].sort((idA, idB) => {
        const a = ordered.findIndex((o) => o.id === idA);
        const b = ordered.findIndex((o) => o.id === idB);
        return b - a; // most-recently-approved (last in `ordered`) first
      });

      for (const id of residualInOrder) {
        // Re-check against the current state each time — migrating one
        // occupant out can already resolve another's collision.
        if (!findCollidingIds(currentOccupants).has(id)) continue;

        const occupant = currentOccupants.find((o) => o.id === id)!;
        const emptyTile = findEmptyTile(occupiedTileKeys);
        const emptyTileKey = `${emptyTile.tileX},${emptyTile.tileY}`;
        const { positionX, positionY } = resolveCollisionFreePosition(
          occupant.id,
          { width: occupant.width, height: occupant.height },
          occupant.rotation,
          []
        );

        const updated = await messageRepository.migrateToEmptyTile(occupant.id, emptyTile.tileX, emptyTile.tileY, positionX, positionY);
        if (!updated) {
          console.warn(`    [WARN] migrateToEmptyTile returned null for ${occupant.id} (no longer approved?).`);
          continue;
        }
        occupiedTileKeys.add(emptyTileKey);
        messageTile.set(occupant.id, emptyTile);
        migratedCount++;
        console.log(`    Migrated 1 over-capacity card from tile ${tileKey} to empty tile ${emptyTileKey}.`);

        currentOccupants = currentOccupants.filter((o) => o.id !== id);
      }
    }

    totalAfter += countCollisionPairs(currentOccupants);
  }

  // EPIC 050: Step 2 — a message can be perfectly collision-free and still
  // be unreachable, if its tile sits far outside anywhere the default
  // camera position would ever load it from (a legacy artifact of
  // pre-EPIC-047/049 placement runs, or — as this project's own history
  // shows — a `message_placement_seq` that had drifted far ahead before a
  // `db:recalibrate-sequence` run). "Collision-free" and "reachable" are
  // independent properties, so this checks every approved message's
  // *current* tile (`messageTile`, kept in sync with Step 1's own
  // migrations above) against `computeReachableTileKeys` regardless of
  // whether Step 1 touched it at all.
  const approvedIds = new Set(rows.map((row) => row.id));
  const reachableTileKeys = computeReachableTileKeys(approvedIds);
  let normalizedCount = 0;

  for (const row of rows) {
    const currentTile = messageTile.get(row.id);
    if (!currentTile) continue; // Not placed at all — already skipped above; nothing this step can normalize.
    const currentTileKey = `${currentTile.tileX},${currentTile.tileY}`;
    if (reachableTileKeys.has(currentTileKey)) continue;

    // Same centralized primitives as everywhere else in this file — never
    // a second collision/placement algorithm. `findEmptyTile` starting
    // from sequence 0 walks the spiral from the *origin*, so this always
    // finds the closest-to-center genuinely empty tile, not merely "some"
    // empty tile — keeping a normalized card as visually close to the
    // board's default view as the current layout allows. Rotation is
    // preserved exactly (never recomputed): landing in an empty tile is
    // trivially collision-free at any rotation, so there's no reason to
    // change the note's existing visual character.
    const footprint = estimateNoteFootprint(row.templateId, row.content, row.fontFamily as NoteTextFontFamily);
    const emptyTile = findEmptyTile(occupiedTileKeys, 0);
    const emptyTileKey = `${emptyTile.tileX},${emptyTile.tileY}`;
    const { positionX, positionY } = resolveCollisionFreePosition(row.id, footprint, row.rotation!, []);

    const updated = await messageRepository.migrateToEmptyTile(row.id, emptyTile.tileX, emptyTile.tileY, positionX, positionY);
    if (!updated) {
      console.warn(`  [WARN] migrateToEmptyTile returned null for ${row.id} (no longer approved?).`);
      continue;
    }
    occupiedTileKeys.add(emptyTileKey);
    messageTile.set(row.id, emptyTile);
    normalizedCount++;
    console.log(`  Normalized unreachable placement: "${row.content.slice(0, 40)}" tile ${currentTileKey} -> ${emptyTileKey}.`);
  }

  console.log("");
  console.log(`Collision pairs before repair: ${totalBefore}`);
  console.log(`Collision pairs after repair:  ${totalAfter}`);
  console.log(`Unreachable placements normalized: ${normalizedCount}`);
  console.log(`Messages repositioned (same tile): ${repositionedCount}`);
  console.log(`Messages migrated (new tile):       ${migratedCount}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
