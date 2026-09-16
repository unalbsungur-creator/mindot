/**
 * EPIC 050: recalibrates `message_placement_seq` — the Postgres sequence
 * `messageRepository.approve()` draws from to pick a brand-new approval's
 * tile (`tileForSequence(nextval())`, see `features/board/lib/placement.ts`)
 * — back down to the smallest value that still can't collide with any
 * tile a real message (any status) already occupies. A maintenance
 * script in the same on-demand family as `db:seed`/`db:verify`/
 * `db:repair-placements` (`npm run db:recalibrate-sequence`), never run
 * automatically.
 *
 * ROOT CAUSE this exists for (EPIC 050): a Postgres sequence only ever
 * moves forward — `nextval()` is called once per real `approve()`, and
 * deleting the resulting message row afterward (exactly what
 * `db:repair-placements`' own EPIC 049 load-test cleanup did, 60 times)
 * does NOT roll the sequence back. Combined with `SLOTS_PER_TILE=2` (a
 * real, deliberate, EPIC-047/049 collision-avoidance fix — NOT touched
 * here), every 2 consumed sequence values spiral the tile-router one full
 * tile further from the origin. The practical result, confirmed against
 * this project's own real database: `message_placement_seq` had climbed to
 * 239 from cumulative real approvals across many prior testing sessions
 * (most of them since deleted), so the very next real admin approval
 * landed at tile (6,-5) — 4320px/3600px from the origin the default camera
 * (`BOARD_REFERENCE_MESSAGE_TILE`, worldGeometry.ts) always opens on, and
 * far outside `useTileCache`'s visible+buffer fetch range. The message was
 * correctly saved, correctly `status = "approved"`, correctly returned by
 * `listApprovedByTile`/the board API, and correctly rendered once that
 * specific tile was loaded — verified independently at every one of those
 * layers. The *only* broken thing was which tile a brand-new approval
 * lands in, because the sequence itself had drifted far ahead of where the
 * real, currently-live content actually is.
 *
 * This script does not change `SLOTS_PER_TILE`, does not touch any
 * existing message's `tileX`/`tileY`/`positionX`/`positionY`/`rotation`,
 * and does not re-run EPIC 049's collision repair — it only moves the
 * *starting point* for the NEXT `nextval()` call, by finding the smallest
 * tile-aligned sequence value whose resulting tile isn't already used by
 * any message row (any status — an archived/rejected message's tile is
 * still real data occupying that spot, even though it's invisible on the
 * public board) and reissuing `ALTER SEQUENCE ... RESTART WITH`. Safe to
 * run again later if the same drift recurs from future test cleanups.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine, DATABASE_URL may already be set in the environment.
}

import { getDb } from "./client";
import { messages } from "./schema";
import { sql } from "drizzle-orm";
import { SLOTS_PER_TILE, tileForSequence } from "../../features/board/lib/placement";

async function main() {
  const db = getDb();

  const [{ last_value: beforeRaw }] = await db.execute<{ last_value: string }>(
    sql`select last_value from message_placement_seq`
  );
  const before = Number(beforeRaw);

  const rows = await db.select({ tileX: messages.tileX, tileY: messages.tileY }).from(messages);
  const occupiedTileKeys = new Set(
    rows.filter((r) => r.tileX !== null && r.tileY !== null).map((r) => `${r.tileX},${r.tileY}`)
  );
  console.log(`Current sequence last_value: ${before}`);
  console.log(`Tiles occupied by any existing message (any status): ${occupiedTileKeys.size}`);

  let sequence = 0;
  for (let guard = 0; guard < 1_000_000; guard++) {
    const tile = tileForSequence(sequence);
    if (!occupiedTileKeys.has(`${tile.tileX},${tile.tileY}`)) break;
    sequence += SLOTS_PER_TILE;
  }

  const nextTile = tileForSequence(sequence);
  console.log(`Recalibrating to sequence ${sequence} (next approval routes to tile ${nextTile.tileX},${nextTile.tileY}).`);

  if (sequence >= before) {
    console.log("Sequence is already at or below the recalibrated target — no change needed.");
    process.exit(0);
  }

  // RESTART WITH sets the value nextval() returns on its NEXT call, so this
  // exact `sequence` value is what the next real approval will consume —
  // matching `tileForSequence(sequence)`'s logged prediction above exactly.
  await db.execute(sql`select setval('message_placement_seq', ${sequence}, false)`);

  const [{ last_value: afterRaw }] = await db.execute<{ last_value: string }>(
    sql`select last_value from message_placement_seq`
  );
  console.log(`Done. New last_value: ${afterRaw}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
