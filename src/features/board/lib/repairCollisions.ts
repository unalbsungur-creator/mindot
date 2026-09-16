import { hasCollision, resolveCollisionFreePosition, type OccupantFootprint } from "./placement";

/** One tile occupant, identified — everything `repairTileCollisions` needs to decide whether it collides with an already-accepted neighbor and, if so, where a collision-free spot for it actually is. */
export interface RepairableOccupant extends OccupantFootprint {
  id: string;
}

export interface RepairResult {
  id: string;
  positionX: number;
  positionY: number;
}

/**
 * How many relaxation sweeps `repairTileCollisions` allows before giving up
 * on a tile. A single greedy left-to-right pass (checking each occupant
 * only against occupants already "accepted" earlier in the order) proved
 * insufficient on this project's own legacy data: a tile with several
 * large occupants (three 176x176 football cards plus four standard notes,
 * all originally placed under the pre-EPIC-047 `SLOTS_PER_TILE=36` regime)
 * left later occupants boxed in by earlier ones that a single pass never
 * revisits, so the search sometimes had to fall back to a still-colliding
 * "least overlap" position even though genuinely free space existed
 * elsewhere in the tile. Repeated sweeps let a card that moved in one pass
 * free up room a still-colliding card can use in the next.
 */
const MAX_REPAIR_ITERATIONS = 8;

/**
 * EPIC 049: the single, centralized repair pass for one tile's worth of
 * *already-persisted* placements — the read-side counterpart to
 * `computePlacement`'s write-side collision avoidance, built on the exact
 * same primitives (`hasCollision`/`resolveCollisionFreePosition` from
 * `./placement`) so a "collision" never means two different things
 * depending on which code path is asking.
 *
 * `occupantsInOrder` must already be in the caller's chosen deterministic
 * processing order (see `src/lib/db/repairPlacements.ts`, which orders by
 * `moderatedAt` ascending). `occupantsInOrder[0]` — the message approved
 * first — is the one fixed anchor that never moves, giving every sweep a
 * stable reference point; every other occupant is a candidate for
 * repositioning on any sweep where it's found colliding with *any* other
 * occupant's current position (not just ones ordered before it), via
 * `resolveCollisionFreePosition` at its EXISTING rotation (never changed,
 * so the note's visual character is unchanged). Sweeps repeat — each one
 * computed from the previous sweep's resulting positions — until a full
 * sweep finds zero collisions or `MAX_REPAIR_ITERATIONS` is reached, so an
 * occupant that had to move to make room for one repair can itself be
 * re-examined if that move happens to newly crowd a different neighbor.
 * An occupant that never collides across every sweep keeps its original,
 * untouched position — this is what keeps a repair run minimal ("sadece
 * gerçekten collision oluşturan kartları yeniden yerleştir"), not a full
 * re-layout of the tile.
 *
 * Deterministic and idempotent for a fixed input order: every primitive
 * this is built on is a pure function of its inputs (no `Math.random`
 * anywhere in this call chain), so running this again against a tile that
 * this function already made collision-free — or one that was already
 * collision-free to begin with — returns an empty change list every time.
 */
export function repairTileCollisions(occupantsInOrder: RepairableOccupant[]): RepairResult[] {
  const original = new Map(occupantsInOrder.map((o) => [o.id, { positionX: o.positionX, positionY: o.positionY }]));
  let current: RepairableOccupant[] = occupantsInOrder.map((o) => ({ ...o }));

  for (let iteration = 0; iteration < MAX_REPAIR_ITERATIONS; iteration++) {
    let anyCollision = false;
    const next = current.map((o) => ({ ...o }));

    for (let i = 1; i < next.length; i++) {
      const others = next.filter((_, index) => index !== i);
      if (!others.some((other) => hasCollision(next[i], other))) continue;

      anyCollision = true;
      const { positionX, positionY } = resolveCollisionFreePosition(
        next[i].id,
        { width: next[i].width, height: next[i].height },
        next[i].rotation,
        others
      );
      next[i] = { ...next[i], positionX, positionY };
    }

    current = next;
    if (!anyCollision) break;
  }

  const changes: RepairResult[] = [];
  for (const occupant of current) {
    const before = original.get(occupant.id)!;
    if (before.positionX !== occupant.positionX || before.positionY !== occupant.positionY) {
      changes.push({ id: occupant.id, positionX: occupant.positionX, positionY: occupant.positionY });
    }
  }
  return changes;
}
