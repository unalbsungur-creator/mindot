import { publicPurchaseUrl } from "../lib/publicPurchaseUrl";

/**
 * Where a buyer goes to purchase the digital frame product. Architecturally
 * prepared, not live-integrated: there is no real Shoppier product
 * configured yet, so this is empty by default — the write-up UI checks for
 * that and explains the product isn't available for purchase yet rather
 * than sending anyone to a broken link. Set SHOPPIER_PRODUCT_URL once a
 * real product exists.
 *
 * Server-only: a plain (non-`NEXT_PUBLIC_`) runtime variable, read per
 * call so a Worker's runtime env applies. Never import this from a
 * "use client" component — there it would always be null in the browser
 * and differ from the server render. Server pages read it and pass the
 * public URL down as a prop (purchaseLinks.test.ts guards this).
 */
export function getShoppierProductUrl(): string | null {
  return publicPurchaseUrl(process.env.SHOPPIER_PRODUCT_URL);
}
