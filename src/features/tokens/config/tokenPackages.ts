/**
 * Token packages sold through Shopier (Token Al V1, manual model): the
 * buyer pays on Shopier and an admin credits the Tokens by hand — nothing
 * here talks to Shopier. A package's amount and price are fixed product
 * data; whether it is on sale is a separate, runtime question answered by
 * its product link alone.
 *
 * The product links come only from server-side runtime variables
 * (SHOPIER_TOKEN_10_URL / _50_ / _100_), read on every call so a Worker's
 * runtime env applies — never NEXT_PUBLIC_*, never captured at import.
 * Unset, blank or anything `shopierProductUrl` refuses means that package
 * isn't on sale (`null`); sales therefore start closed. Never import this
 * module from a "use client" component: server pages read the links and
 * pass them down as props (tokenPackages.test.ts guards this, like
 * memories/config/purchaseLinks.test.ts does for Shoppier/DilekKutum).
 */

export type TokenPackageId = "tokens-10" | "tokens-50" | "tokens-100";

export interface TokenPackage {
  id: TokenPackageId;
  /** Tokens credited for this package — the admin purchase record takes the amount from here, never from a form. */
  tokens: number;
  /** Price in whole Turkish lira, as listed on Shopier. Display only: payment happens on Shopier. */
  priceTry: number;
}

const PACKAGES: TokenPackage[] = [
  { id: "tokens-10", tokens: 10, priceTry: 12 },
  { id: "tokens-50", tokens: 50, priceTry: 50 },
  { id: "tokens-100", tokens: 100, priceTry: 80 },
];

export const TOKEN_PACKAGES: readonly Readonly<TokenPackage>[] = Object.freeze(PACKAGES.map((pkg) => Object.freeze(pkg)));

export function isTokenPackageId(value: unknown): value is TokenPackageId {
  return typeof value === "string" && TOKEN_PACKAGES.some((pkg) => pkg.id === value);
}

export function getTokenPackage(id: string): TokenPackage | null {
  return TOKEN_PACKAGES.find((pkg) => pkg.id === id) ?? null;
}

const SHOPIER_HOSTNAME = "www.shopier.com";
const SHOPIER_ORIGIN_PREFIX = `https://${SHOPIER_HOSTNAME}/`;
const MAX_URL_LENGTH = 2048;

/** Whitespace, ASCII control characters (incl. DEL) and backslashes. */
function isUnsafeUrlCharacter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code <= 0x20 || code === 0x7f || char === "\\" || /\s/u.test(char);
}

/**
 * A Shopier product link, or `null`. Stricter than `publicPurchaseUrl`
 * (memories/lib/publicPurchaseUrl.ts, which also allows http: and any
 * host): the trimmed value must literally start with
 * `https://www.shopier.com/`, contain no whitespace, control characters or
 * backslashes (the URL parser would silently drop or rewrite those, so the
 * link a browser follows could differ from the one checked), name a product
 * path, and carry no credentials or explicit port. The value is returned as
 * given — never rewritten or redirected elsewhere. Never throws.
 */
export function shopierProductUrl(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  if ([...trimmed].some(isUnsafeUrlCharacter)) return null;
  if (!trimmed.startsWith(SHOPIER_ORIGIN_PREFIX)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== SHOPIER_HOSTNAME) return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (url.pathname === "/") return null;
  return trimmed;
}

/** The package's Shopier link, read from its runtime variable on every call; `null` = not on sale. */
export function getTokenPackagePurchaseUrl(id: TokenPackageId): string | null {
  switch (id) {
    case "tokens-10":
      return shopierProductUrl(process.env.SHOPIER_TOKEN_10_URL);
    case "tokens-50":
      return shopierProductUrl(process.env.SHOPIER_TOKEN_50_URL);
    case "tokens-100":
      return shopierProductUrl(process.env.SHOPIER_TOKEN_100_URL);
    default:
      return null;
  }
}

export interface TokenPackageOffer extends TokenPackage {
  /** `null` while this package isn't on sale. */
  purchaseUrl: string | null;
}

/** Every package with its current link — what a server page hands to the client as props. */
export function getTokenPackageOffers(): TokenPackageOffer[] {
  return TOKEN_PACKAGES.map((pkg) => ({ ...pkg, purchaseUrl: getTokenPackagePurchaseUrl(pkg.id) }));
}
