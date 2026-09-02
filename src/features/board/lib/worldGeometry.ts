/**
 * Pure math for the infinite board's world <-> tile <-> screen coordinate
 * conversions. No React, no DOM — kept testable and reusable by both the
 * camera state and the tile-loading logic.
 */

/** One tile's edge length in world pixels at zoom = 1. */
export const TILE_PX = 720;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.2;
export const DEFAULT_ZOOM = 1;

/** Extra ring of tiles to load beyond the strictly-visible area, so panning doesn't outrun loading. */
export const TILE_LOAD_BUFFER = 1;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface TileCoord {
  x: number;
  y: number;
}

/**
 * The board's canonical reference message — "Kalite asla tesadüf
 * değildir." (Ünal Büyüksungur, approved 2026-09-02T07:40:51Z, message id
 * cdc79948-f9ff-40d1-9bf4-609915b0d293). Read directly from the `messages`
 * table's real, already-approved placement (tileX=0, tileY=0,
 * positionX≈0.2047, positionY≈0.0596) — not invented. Since a published
 * note's placement is permanent once approved (see CLAUDE.md's "Board /
 * tile architecture" — nothing ever recomputes or reshuffles it), baking
 * in the resulting world point here is safe and avoids adding a runtime
 * lookup just to find a fixed anchor. A second, later message with the
 * exact same content (same author, resubmitted) also exists in the
 * database at a different position — left untouched as ordinary board
 * content; this constant intentionally points at the earlier of the two.
 */
export const BOARD_REFERENCE_MESSAGE_ID = "cdc79948-f9ff-40d1-9bf4-609915b0d293";
const BOARD_REFERENCE_MESSAGE_TILE: TileCoord = { x: 0, y: 0 };
const BOARD_REFERENCE_MESSAGE_POSITION = { x: 0.20470588, y: 0.059607845 };

/** The world-space point the board's "return to center" control targets when the reference message is live. */
export function boardReferencePoint(): { x: number; y: number } {
  return {
    x: BOARD_REFERENCE_MESSAGE_TILE.x * TILE_PX + BOARD_REFERENCE_MESSAGE_POSITION.x * TILE_PX,
    y: BOARD_REFERENCE_MESSAGE_TILE.y * TILE_PX + BOARD_REFERENCE_MESSAGE_POSITION.y * TILE_PX,
  };
}

/**
 * EPIC: Approved Message Management — Part 7 (reference message
 * protection). Resolves the actual point the "return to center" control
 * should use: the real reference message's coordinate if it's still
 * live, or a safe fallback if it's been archived (or is otherwise
 * missing) — never a runtime error, never silently promoting some other
 * message (the duplicate included) to canonical status.
 *
 * `approvedTileZeroMessageIds` is the id list from tile (0,0)'s current
 * *approved* messages — the caller (app/board/page.tsx) already fetches
 * that tile server-side for `initialTile`, so this needs no extra query.
 *
 * The fallback is `(TILE_PX/2, TILE_PX/2)` — BoardCenterMark's own
 * position, the existing "MINDOT center" concept — not a new anchor and
 * not BoardCenterMark itself being touched, just the same coordinate it
 * already uses independently.
 */
export function resolveBoardCenterPoint(approvedTileZeroMessageIds: string[]): { x: number; y: number } {
  if (approvedTileZeroMessageIds.includes(BOARD_REFERENCE_MESSAGE_ID)) {
    return boardReferencePoint();
  }
  return { x: TILE_PX / 2, y: TILE_PX / 2 };
}

export function tileKey(tile: TileCoord): string {
  return `${tile.x},${tile.y}`;
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/**
 * The world-space rectangle currently visible given a camera (centered on
 * camera.x/y) and a viewport pixel size.
 */
export function visibleWorldRect(camera: Camera, viewportWidth: number, viewportHeight: number) {
  const halfW = viewportWidth / 2 / camera.zoom;
  const halfH = viewportHeight / 2 / camera.zoom;
  return {
    left: camera.x - halfW,
    right: camera.x + halfW,
    top: camera.y - halfH,
    bottom: camera.y + halfH,
  };
}

/** Tiles that should be loaded/rendered for the current camera, including the buffer ring. */
export function visibleTileRange(camera: Camera, viewportWidth: number, viewportHeight: number): TileCoord[] {
  const rect = visibleWorldRect(camera, viewportWidth, viewportHeight);
  const minTileX = Math.floor(rect.left / TILE_PX) - TILE_LOAD_BUFFER;
  const maxTileX = Math.floor(rect.right / TILE_PX) + TILE_LOAD_BUFFER;
  const minTileY = Math.floor(rect.top / TILE_PX) - TILE_LOAD_BUFFER;
  const maxTileY = Math.floor(rect.bottom / TILE_PX) + TILE_LOAD_BUFFER;

  const tiles: TileCoord[] = [];
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      tiles.push({ x: tx, y: ty });
    }
  }
  return tiles;
}

/** The CSS transform that puts world-space content at the right screen position for this camera. */
export function worldTransform(camera: Camera, viewportWidth: number, viewportHeight: number): string {
  const screenX = viewportWidth / 2 - camera.x * camera.zoom;
  const screenY = viewportHeight / 2 - camera.y * camera.zoom;
  return `translate(${screenX}px, ${screenY}px) scale(${camera.zoom})`;
}

/**
 * Adjusts the camera so that the world point currently under a given
 * screen point stays under that same screen point after the zoom change
 * — the standard "zoom toward cursor" behavior.
 */
export function zoomTowardScreenPoint(
  camera: Camera,
  nextZoom: number,
  screenPointX: number,
  screenPointY: number,
  viewportWidth: number,
  viewportHeight: number
): Camera {
  const clamped = clampZoom(nextZoom);
  const worldX = camera.x + (screenPointX - viewportWidth / 2) / camera.zoom;
  const worldY = camera.y + (screenPointY - viewportHeight / 2) / camera.zoom;
  return {
    x: worldX - (screenPointX - viewportWidth / 2) / clamped,
    y: worldY - (screenPointY - viewportHeight / 2) / clamped,
    zoom: clamped,
  };
}
