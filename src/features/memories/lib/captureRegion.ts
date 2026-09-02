import { getTile } from "@/features/board/repository";
import type { BoardTileMessage, PublicMessageDetail } from "@/features/board/types";
import type { MemoryCaptureMode } from "../types";

export interface CaptureRegion {
  tileX: number;
  tileY: number;
  primary: BoardTileMessage;
  /** Other approved notes sharing the primary note's tile — empty for "note_only". */
  surrounding: BoardTileMessage[];
}

/**
 * Resolves what a memory output should show around the selected note.
 * Deliberately the simplest region that's still deterministic and
 * server-verifiable: the note's own tile. Because approved placement is
 * permanent (see "Board / tile architecture" in CLAUDE.md), the same
 * message always resolves to the same tile, so the same capture
 * configuration always reproduces the same output — no client screenshot,
 * no randomness. Only ever built from `getTile`, so only approved/public
 * messages (with the same anonymous-author guarantee) can appear here.
 */
export async function resolveCaptureRegion(
  message: PublicMessageDetail,
  captureMode: MemoryCaptureMode
): Promise<CaptureRegion> {
  if (captureMode === "note_only") {
    return { tileX: message.tileX, tileY: message.tileY, primary: message, surrounding: [] };
  }

  const tile = await getTile(message.tileX, message.tileY);
  const surrounding = tile.messages.filter((candidate) => candidate.id !== message.id);

  return { tileX: message.tileX, tileY: message.tileY, primary: message, surrounding };
}
