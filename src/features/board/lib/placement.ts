/**
 * Assigns a board position to a newly approved message. Deterministic and
 * reproducible: the same (sequence, messageId) pair always produces the
 * same placement, so this can be recomputed or audited later. It knows
 * nothing about note templates or rendering — see features/notes for that.
 */

export interface Placement {
  tileX: number;
  tileY: number;
  /** Fraction of the tile's width/height, 0..1 — unit-agnostic on purpose. */
  positionX: number;
  positionY: number;
  /** Degrees. */
  rotation: number;
}

const TILE_GRID = 6;
const SLOTS_PER_TILE = TILE_GRID * TILE_GRID;
const MAX_ROTATION_DEG = 8;

export function computePlacement(sequence: number, messageId: string): Placement {
  const tileIndex = Math.floor(sequence / SLOTS_PER_TILE);
  const slot = sequence % SLOTS_PER_TILE;
  const { x: tileX, y: tileY } = spiralTileCoordinate(tileIndex);

  const col = slot % TILE_GRID;
  const row = Math.floor(slot / TILE_GRID);
  const cell = 1 / TILE_GRID;
  const jitter = hashJitter(messageId);

  return {
    tileX,
    tileY,
    positionX: clamp01(col * cell + cell / 2 + jitter.x * cell * 0.3),
    positionY: clamp01(row * cell + cell / 2 + jitter.y * cell * 0.3),
    rotation: jitter.rotation * MAX_ROTATION_DEG,
  };
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
