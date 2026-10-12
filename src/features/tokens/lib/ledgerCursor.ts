/**
 * Keyset cursor for paging the token ledger newest-first by
 * (created_at, id). `createdAtMicros` is Postgres's own microsecond value,
 * never a JS Date: a Date only holds milliseconds, and rounding the cursor
 * would skip rows created within the same millisecond.
 */
export interface LedgerCursor {
  createdAtMicros: string;
  id: string;
}

const CURSOR_PATTERN = /^(\d{1,20})_([A-Za-z0-9-]{1,64})$/;

export function formatLedgerCursor(cursor: LedgerCursor): string {
  return `${cursor.createdAtMicros}_${cursor.id}`;
}

/** `null` for anything that isn't a cursor this module produced — callers fall back to the first page. */
export function parseLedgerCursor(raw: string | undefined | null): LedgerCursor | null {
  if (typeof raw !== "string") return null;
  const match = CURSOR_PATTERN.exec(raw);
  return match ? { createdAtMicros: match[1], id: match[2] } : null;
}
