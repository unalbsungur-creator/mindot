/**
 * An external purchase link (Shoppier, DilekKutum) from a runtime variable:
 * the trimmed value when it's an absolute http(s) URL, otherwise `null` —
 * unset, blank, relative or any other scheme (e.g. `javascript:`) all mean
 * "not available yet", never a link the browser would follow.
 */
export function publicPurchaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? trimmed : null;
  } catch {
    return null;
  }
}
