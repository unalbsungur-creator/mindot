import type { Metadata } from "next";
import { auth } from "@/features/auth/auth";
import { getTokenPackageOffers } from "@/features/tokens/config/tokenPackages";
import { tokenRepository } from "@/features/tokens/repository";
import { userRepository } from "@/features/users/repository";
import type { User } from "@/features/users/types";
import { TokensPageContent, type TokenPackageListing } from "./_components/TokensPageContent";

// The Shopier links are runtime variables read per request
// (getTokenPackageOffers), and the page is per-viewer — never a build-time
// prerender, which would freeze the links into the bundle.
export const dynamic = "force-dynamic";

// A purchase page, not a search result: noindex, and not in sitemap.ts.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * /tokens — Token Al V1 (manual model). Everyone sees the three packages
 * and their prices (amount and price from TOKEN_PACKAGES, never repeated
 * here). Only a signed-in account gets a package's Shopier link, and only
 * one that `shopierProductUrl` accepted; a guest gets no link at all, just
 * whether a package is on sale, and is asked to sign in first — Tokens can
 * only be credited to an account. Nothing else from the server's
 * configuration reaches the client.
 */
export default async function TokensPage() {
  const offers = getTokenPackageOffers();
  const session = await auth();
  const userId = session?.user?.id ?? null;
  // The account's own email from the database, not the session token.
  const [user, balance]: [User | null, number] = userId
    ? await Promise.all([userRepository.getById(userId), tokenRepository.getBalance(userId)])
    : [null, 0];
  const signedIn = user !== null;

  const packages: TokenPackageListing[] = offers.map((offer) => ({
    id: offer.id,
    tokens: offer.tokens,
    priceTry: offer.priceTry,
    onSale: offer.purchaseUrl !== null,
    purchaseUrl: signedIn ? offer.purchaseUrl : null,
  }));

  return <TokensPageContent account={user ? { email: user.email, balance } : null} packages={packages} />;
}
