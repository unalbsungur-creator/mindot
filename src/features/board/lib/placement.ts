/**
 * Assigns a board position to a newly approved message. Deterministic and
 * reproducible for a given (sequence, messageId, footprint, occupants)
 * tuple — the same inputs always produce the same placement, so this can
 * be recomputed or audited later. It knows nothing about note templates or
 * rendering itself — see features/notes for that — it only ever receives
 * plain width/height numbers (a note's "footprint") and existing
 * occupants' own footprints as data, never a template or a DOM node.
 *
 * DUVAR KART YERLEŞİMİ FIX — root cause this rewrite addresses: the
 * previous version placed every note in a fixed 1/6-of-tile grid cell
 * (120px @ TILE_PX=720) regardless of the note's actual rendered size
 * (176px wide, plus variable content-driven height) and, critically,
 * computed a *cell-center* fraction while `Note.tsx`/`InfiniteBoard`
 * apply `positionX`/`positionY` as the note's *top-left* CSS offset — so
 * every note's real footprint was already shifted right/down by roughly
 * half its own size from where the grid math assumed, on top of being
 * wider than its own cell. Neither of those ever accounted for sibling
 * notes actually already in the tile, or for tile-edge margin, so
 * overlap (including bleeding into the *next* tile at the right/bottom
 * edge) was structural, not incidental. This version keeps the existing
 * top-left semantics (unchanged in Note.tsx/InfiniteBoard) and instead:
 * reserves a margin equal to the note's own footprint so it can never
 * extend past its tile, searches an adaptive grid sized to the note's
 * actual footprint (not a fixed 6x6), and rejects/re-ranks candidates
 * that collide with real sibling footprints (rotation-aware, via each
 * box's rotated AABB) before falling back to the least-overlapping
 * candidate found.
 */

export interface Placement {
  tileX: number;
  tileY: number;
  /** Fraction of the tile's width/height, 0..1 — the note's top-left corner (matches how Note.tsx/InfiniteBoard apply `position.top`/`position.left`). */
  positionX: number;
  positionY: number;
  /** Degrees. */
  rotation: number;
}

export interface NoteFootprint {
  /** World px at zoom = 1 (same units as TILE_PX). */
  width: number;
  height: number;
}

/** An already-placed sibling note in the same tile, described only by the plain numbers placement needs — never a template or message object. */
export interface OccupantFootprint extends NoteFootprint {
  positionX: number;
  positionY: number;
  rotation: number;
}

/** One tile's edge length in world pixels at zoom = 1 — mirrors `worldGeometry.ts`'s `TILE_PX`. Duplicated as a plain constant rather than imported, so this file stays dependency-free/pure and independently testable. */
const TILE_PX = 720;

/**
 * How many messages get routed into one tile before spiraling out to the
 * next — a density control for *tile assignment*, independent of the
 * adaptive intra-tile position search below (which sizes itself to each
 * note's real footprint regardless of this constant). Left at its
 * original value: today's reported overlap was never caused by a tile
 * genuinely exceeding real capacity (a handful of notes per tile), and
 * changing it would shift which tile every *future* message routes to,
 * which is a bigger blast radius than this fix needs — see the report's
 * "future improvement" notes for when this should be revisited.
 */
const SLOTS_PER_TILE = 36;

const MAX_ROTATION_DEG = 8;

/**
 * Minimum breathing room between two notes' (rotation-inflated) boxes,
 * in world px. Requested range was 16-32px; picked the midpoint rather
 * than either extreme — 16px reads as barely-separated at typical note
 * sizes (~176px wide), while 32px shrinks a 720px tile's real capacity
 * enough to push ordinary, non-crowded tiles into the least-overlap
 * fallback prematurely (3 notes @ 176px + 2 gaps of 32px = 592px, still
 * fine, but combined with height gaps it starts mattering for a 4-note
 * row). 24px keeps a visible gap while leaving room for ~3 columns of
 * standard-width notes per tile with margin to spare.
 */
const MIN_GAP_PX = 24;

/**
 * DUVAR CARD VISIBILITY FIX — a note's placement "footprint" (from
 * features/notes/lib/footprint.ts) is its *paper* size only — the real
 * rendered card always draws a little further than that, from fixed-px
 * (never note-size-scaled) overlays Note.tsx positions with a negative
 * offset: the attachment (`tape`: -top-3/12px, `pin`: -top-2/8px), a
 * decoration icon (-top-1.5/-left-1.5, 6px), the like button
 * (-bottom-2/-left-2, 8px), and the author avatar (-bottom-2/-right-2,
 * 8px). None of that was reserved by the tile-boundary clamp or the
 * inter-note collision box below — only the paper rectangle was — so an
 * edge-hugging position (previously valid, since the paper itself still
 * fit) could push one of these always-visible overlays outside the tile,
 * or into a spot the collision search never checked against a neighbor's
 * own overlays. 16px covers the largest of them (tape's 12px) with a
 * small margin, and — since DUVAR always renders board/world notes at a
 * single fixed size (`size: "md"` in InfiniteBoard's `tileToNoteData`,
 * never scaled) — is deliberately a flat constant, not something
 * multiplied by a scale factor the way features/sharing's Memory Print
 * card sizing has to be. The hover-only hover action toolbar (EPIC:
 * Professional hover actions) is NOT included in this budget — it's inset
 * at the card's own top-right corner (see Note.tsx), never overflows, and
 * only ever appears for the one note someone is actively pointing at.
 */
const DECORATIVE_OVERFLOW_PX = 16;

export function computePlacement(
  sequence: number,
  messageId: string,
  footprint: NoteFootprint,
  occupants: OccupantFootprint[] = []
): Placement {
  const { tileX, tileY } = tileForSequence(sequence);
  const jitter = hashJitter(messageId);
  const rotation = jitter.rotation * MAX_ROTATION_DEG;
  const { positionX, positionY } = resolveCollisionFreePosition(messageId, footprint, rotation, occupants);

  return { tileX, tileY, positionX, positionY, rotation };
}

/** Which tile a given placement sequence number routes to — pure, and independent of any note's size or siblings, so callers can resolve this before querying the tile's current occupants. */
export function tileForSequence(sequence: number): { tileX: number; tileY: number } {
  const tileIndex = Math.floor(sequence / SLOTS_PER_TILE);
  const { x, y } = spiralTileCoordinate(tileIndex);
  return { tileX: x, tileY: y };
}

/**
 * The collision-aware core. Builds an adaptive grid of candidate top-left
 * positions sized to this note's own footprint (so a wider/taller note
 * naturally gets fewer, more spaced-out candidates than a small one),
 * ordered by a deterministic spiral out from a hash-chosen preferred
 * cell, and returns the first candidate whose rotated bounding box (plus
 * `MIN_GAP_PX`) doesn't overlap any existing occupant. If every candidate
 * collides with something, falls back to the candidate with the least
 * total overlap — still fully deterministic, never `Math.random`.
 *
 * Exported (unlike the rest of this module's internals) because it
 * already treats `rotation` as an independent input rather than deriving
 * one — `computePlacement` just happens to pass it a hash-derived value.
 * A stale-placement recompute that must preserve each message's existing
 * rotation while only choosing a new collision-free position can call
 * this directly with that rotation, with zero change to how
 * `computePlacement` itself behaves for newly-approved messages.
 */
export function resolveCollisionFreePosition(
  messageId: string,
  footprint: NoteFootprint,
  rotation: number,
  occupants: OccupantFootprint[]
): { positionX: number; positionY: number } {
  // ROTATION-AWARE BOUNDARY FIX — root cause this rewrite addresses: the
  // previous version reserved a flat `DECORATIVE_OVERFLOW_PX` margin sized
  // from the note's *unrotated* width/height, while the actual collision
  // box (`boxFor`, below) inflates the note's *rotated* AABB by that same
  // margin. For any note with nonzero rotation (every note — MAX_ROTATION_DEG
  // is never 0), the rotated AABB is strictly larger than the unrotated
  // footprint, so the boundary clamp was reserving less room than the
  // collision box actually occupies — confirmed by a real dry run against
  // the 11 currently-approved messages: 5 of them still had their
  // decorative-inflated box extend past the tile edge (up to ~10.8px)
  // even after the previous fix, every single one at a nonzero rotation
  // angle. `rotatedHalfExtents` below is now the *one* place this
  // project computes a note's rotated bounding half-size, and both the
  // boundary clamp and `boxFor`'s collision box call it — they can no
  // longer drift apart the way flat-vs-rotated math did here.
  const half = rotatedHalfExtents(footprint.width, footprint.height, rotation);
  const inflatedHalfW = half.halfW + DECORATIVE_OVERFLOW_PX;
  const inflatedHalfH = half.halfH + DECORATIVE_OVERFLOW_PX;

  // Same derivation as before (top-left corner clamped so the note's own
  // box never crosses the tile edge), just against the note's real
  // rotated+inflated half-extents instead of assuming they equal half the
  // unrotated footprint. `centerX = left + width/2` (see `boxFor`) is
  // unchanged — CSS `rotate()` pivots the *painted* box around its own
  // unrotated center without changing the DOM box model position.left is
  // still measured against, so this still stores the exact same top-left
  // fraction Note.tsx/InfiniteBoard already expect (see the `Placement`
  // interface's doc comment) — only the *legal range* for that value
  // changed, never what the stored value itself represents.
  const minLeft = inflatedHalfW - footprint.width / 2;
  const minTop = inflatedHalfH - footprint.height / 2;
  const maxLeft = Math.max(minLeft, TILE_PX - footprint.width / 2 - inflatedHalfW);
  const maxTop = Math.max(minTop, TILE_PX - footprint.height / 2 - inflatedHalfH);
  // A note whose rotated+inflated box is wider/taller than the whole tile
  // (maxLeft < minLeft before the clamp above) genuinely cannot fit with a
  // fully clear margin — not something this function can solve by
  // shrinking or de-rotating the note (both explicitly out of scope; see
  // the module doc comment). The `Math.max` above keeps the range
  // non-empty (falls back to a single point at `minLeft`/`minTop`) so the
  // search below still terminates with *a* position rather than
  // producing NaN candidates; a real occurrence of this is reported by
  // the caller's own boundary-violation metrics, not silently hidden.
  const packableWidth = Math.max(0, maxLeft - minLeft);
  const packableHeight = Math.max(0, maxTop - minTop);

  // Candidate *density* is a deliberately separate concern from the
  // boundary *range* fixed above — this only controls how many discrete
  // positions get sampled inside [minLeft,maxLeft]x[minTop,maxTop], never
  // whether a candidate is actually accepted (the real overlap check
  // below, using the full rotated+inflated `boxFor`, is what enforces
  // that). Sizing this from the *unrotated* footprint (unchanged from
  // before this fix) deliberately keeps the grid fine-grained: an earlier
  // version of this fix sized it from the larger rotated+inflated extents
  // instead, which collapsed `cols`/`rows` to as little as 1 for
  // taller/rotated templates (polaroid, kraft-tag, ...) — leaving so few
  // real candidates that the search sometimes had nothing collision-free
  // to fall back on at all. Confirmed by a real dry run: that version
  // produced a genuine pairwise overlap (a -112px gap) that the previous,
  // finer-grained grid never had. More candidates is strictly safer for
  // collision avoidance; this is a search-resolution knob, not a physical
  // size assumption, so reusing the plain footprint here is intentional.
  const cols = Math.max(1, Math.floor(packableWidth / (footprint.width + MIN_GAP_PX)));
  const rows = Math.max(1, Math.floor(packableHeight / (footprint.height + MIN_GAP_PX)));
  const stepX = cols > 1 ? (maxLeft - minLeft) / (cols - 1) : 0;
  const stepY = rows > 1 ? (maxTop - minTop) / (rows - 1) : 0;

  const jitter = hashJitter(messageId);
  const preferredCol = clampInt(Math.floor(((jitter.x + 1) / 2) * cols), 0, cols - 1);
  const preferredRow = clampInt(Math.floor(((jitter.y + 1) / 2) * rows), 0, rows - 1);

  const occupantBoxes = occupants.map((occupant) =>
    boxFor(occupant.positionX, occupant.positionY, occupant.width, occupant.height, occupant.rotation)
  );

  let bestCandidate: { left: number; top: number } | null = null;
  let bestOverlap = Infinity;

  for (const [col, row] of spiralGridOrder(cols, rows, preferredCol, preferredRow)) {
    const cellLeft = cols > 1 ? minLeft + col * stepX : (minLeft + maxLeft) / 2;
    const cellTop = rows > 1 ? minTop + row * stepY : (minTop + maxTop) / 2;

    // Small deterministic sub-cell jitter for a natural, non-gridlike
    // look. Safe to apply before checking for overlap: any jitter that
    // would violate MIN_GAP_PX against a real neighbor, or push the note
    // past the tile edge, simply fails the checks below and this
    // candidate is skipped/scored, never trusted blindly.
    const subJitter = hashJitter(`${messageId}:${col}:${row}`);
    const left = clampNumber(cellLeft + subJitter.x * stepX * 0.15, minLeft, maxLeft);
    const top = clampNumber(cellTop + subJitter.y * stepY * 0.15, minTop, maxTop);

    const candidateBox = boxFor(left / TILE_PX, top / TILE_PX, footprint.width, footprint.height, rotation);
    const totalOverlap = occupantBoxes.reduce((sum, box) => sum + overlapAmount(candidateBox, box, MIN_GAP_PX), 0);

    if (totalOverlap === 0) {
      return { positionX: left / TILE_PX, positionY: top / TILE_PX };
    }
    if (totalOverlap < bestOverlap) {
      bestOverlap = totalOverlap;
      bestCandidate = { left, top };
    }
  }

  // No collision-free candidate exists in this tile (it's genuinely over
  // capacity) — controlled degradation: use whichever candidate had the
  // least total overlap, rather than the previous behavior of ignoring
  // siblings altogether.
  const fallback = bestCandidate ?? { left: (minLeft + maxLeft) / 2, top: (minTop + maxTop) / 2 };
  return { positionX: fallback.left / TILE_PX, positionY: fallback.top / TILE_PX };
}

/** Visits every (col, row) in a `cols`x`rows` grid exactly once, in expanding Chebyshev rings out from (startCol, startRow) — the "spiral/grid-based deterministic fallback" search order. */
function spiralGridOrder(cols: number, rows: number, startCol: number, startRow: number): [number, number][] {
  const cells: [number, number][] = [];
  const visited = new Set<string>();
  const maxRadius = cols + rows;

  for (let radius = 0; radius <= maxRadius && cells.length < cols * rows; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const col = startCol + dx;
        const row = startRow + dy;
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
        const key = `${col},${row}`;
        if (visited.has(key)) continue;
        visited.add(key);
        cells.push([col, row]);
      }
    }
  }
  return cells;
}

interface Box {
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
}

/**
 * A rotated rectangle's own axis-aligned half-width/half-height — the
 * *one* place this module computes that geometry, so the tile-boundary
 * clamp in `resolveCollisionFreePosition` and the collision box in
 * `boxFor` can never drift apart the way flat-vs-rotated math did before
 * this fix (a note's boundary margin was sized from its unrotated
 * footprint while its actual collision box used the rotated one — see
 * `resolveCollisionFreePosition`'s doc comment for the real violation
 * this caused). Standard rotated-rectangle AABB formula:
 * `rotatedWidth = |w·cosθ| + |h·sinθ|`, `rotatedHeight = |w·sinθ| +
 * |h·cosθ|` — absolute value is unconditional here since `rotationDeg` is
 * taken as `Math.abs(...)` before the trig, so cos/sin are already
 * non-negative for every angle this project ever produces (`|rotation|
 * <= MAX_ROTATION_DEG`, well under 90°).
 */
function rotatedHalfExtents(width: number, height: number, rotationDeg: number): { halfW: number; halfH: number } {
  const rad = (Math.abs(rotationDeg) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    halfW: (width * cos + height * sin) / 2,
    halfH: (width * sin + height * cos) / 2,
  };
}

/**
 * The rotated axis-aligned bounding box (world px, tile-local) for a note
 * given its top-left fraction position, footprint, and rotation. Rotation
 * pivots around the box's own center, matching `rotate-[...]`'s default
 * `transform-origin` in Note.tsx/CSS. Inflated by `DECORATIVE_OVERFLOW_PX`
 * on every side — a collision box for placement purposes, standing in for
 * the note's real visible footprint (paper + attachment/decoration/like/
 * avatar), not just the paper rectangle — so two notes' *overlays* can't
 * collide even when their *paper* edges technically clear `MIN_GAP_PX`.
 */
function boxFor(positionXFraction: number, positionYFraction: number, width: number, height: number, rotationDeg: number): Box {
  const left = positionXFraction * TILE_PX;
  const top = positionYFraction * TILE_PX;
  const half = rotatedHalfExtents(width, height, rotationDeg);
  return {
    centerX: left + width / 2,
    centerY: top + height / 2,
    halfW: half.halfW + DECORATIVE_OVERFLOW_PX,
    halfH: half.halfH + DECORATIVE_OVERFLOW_PX,
  };
}

/** How much two boxes overlap once `gap` of required separation is subtracted — 0 when they're cleanly apart (including the gap), otherwise a positive magnitude used only to rank fallback candidates (not a physical area). */
function overlapAmount(a: Box, b: Box, gap: number): number {
  const dx = Math.abs(a.centerX - b.centerX);
  const dy = Math.abs(a.centerY - b.centerY);
  const overlapX = a.halfW + b.halfW + gap - dx;
  const overlapY = a.halfH + b.halfH + gap - dy;
  if (overlapX <= 0 || overlapY <= 0) return 0;
  return overlapX * overlapY;
}

/**
 * Maps a non-negative integer to (x, y) on an outward square spiral
 * starting at the origin: 0 -> (0,0), 1 -> (1,0), 2 -> (1,1), 3 -> (0,1),
 * 4 -> (-1,1), ... This is what makes the board grow outward from the
 * center as more tiles fill up, rather than marching off in one direction.
 */
function spiralTileCoordinate(index: number): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };

  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;
  let legLength = 1;
  let stepsInLeg = 0;
  let legsAtCurrentLength = 0;

  for (let i = 0; i < index; i++) {
    x += dx;
    y += dy;
    stepsInLeg++;
    if (stepsInLeg === legLength) {
      stepsInLeg = 0;
      [dx, dy] = [-dy, dx]; // turn 90° counter-clockwise
      legsAtCurrentLength++;
      if (legsAtCurrentLength === 2) {
        legsAtCurrentLength = 0;
        legLength++;
      }
    }
  }

  return { x, y };
}

/** Deterministic pseudo-randomness from a string, so placement is reproducible. */
function hashJitter(id: string): { x: number; y: number; rotation: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const toUnit = (byte: number) => (byte / 255) * 2 - 1;
  return {
    x: toUnit(hash & 0xff),
    y: toUnit((hash >>> 8) & 0xff),
    rotation: toUnit((hash >>> 16) & 0xff),
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
