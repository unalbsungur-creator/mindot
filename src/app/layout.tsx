import type { Metadata } from "next";
import { Geist, Fraunces, Caveat } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { OnboardingModal } from "@/features/onboarding/components/OnboardingModal";
import { SOCIAL_LINKS } from "@/features/sharing/config/social";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getAppUrl } from "@/lib/env";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/siteConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves relative OG/Twitter image URLs (opengraph-image.tsx files)
  // and relative `alternates.canonical`/`openGraph.url` values (this file
  // and every route below) into absolute ones — see getAppUrl() for the
  // env-var precedence and production fallback.
  metadataBase: getAppUrl(),
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image" },
};

// Minimal, conservative JSON-LD: only genuinely-configured information
// (name, canonical URL, and whichever social profiles are actually set —
// see features/sharing/config/social.ts) — no fabricated ratings,
// followers, founders, or addresses. See the Next.js JSON-LD guide's
// `<script>`-in-layout pattern; `<` is escaped since JSON.stringify does
// not sanitize for HTML/script context.
function StructuredData() {
  const siteUrl = getAppUrl().toString();
  const sameAs = Object.values(SOCIAL_LINKS).filter((url): url is string => Boolean(url));

  const jsonLd = [
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: siteUrl },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl,
      ...(sameAs.length > 0 ? { sameAs } : {}),
    },
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <StructuredData />
        <LocaleProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <OnboardingModal />
        </LocaleProvider>
      </body>
    </html>
  );
}
