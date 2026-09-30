"use client";

import { useEffect, useState } from "react";

const EMPTY: ReadonlySet<string> = new Set();

/**
 * For content rendered once for everyone (the ISR homepage hero): asks the
 * private, uncached `/api/blocks/hidden-messages` which of these note ids
 * the signed-in viewer has blocked the author of, so the caller can drop
 * them. Signed-out viewers (and any failure) simply hide nothing. The
 * shared page itself is never personalized or re-cached per viewer.
 */
export function useHiddenMessageIds(messageIds: string[]): ReadonlySet<string> {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(EMPTY);
  const key = messageIds.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/blocks/hidden-messages?ids=${encodeURIComponent(key)}`, { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<{ hidden: string[] }>) : { hidden: [] }))
      .then((data) => {
        if (!cancelled && data.hidden.length > 0) setHidden(new Set(data.hidden));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return hidden;
}
