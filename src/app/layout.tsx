import type { Metadata, Viewport } from "next";
import { Geist, Fraunces, Caveat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SignInOptionsProvider } from "@/components/auth/SignInOptions";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { LocalizedSiteMeta } from "@/components/layout/LocalizedSiteMeta";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { OnboardingModal } from "@/features/onboarding/components/OnboardingModal";
import { SOCIAL_LINKS } from "@/features/sharing/config/social";
import { defaultLocale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { getDictionary } from "@/i18n/translations";
import { isStaging } from "@/lib/appEnvironment";
import { getAppUrl, getAuthRuntimeConfig } from "@/lib/env";
import { SITE_NAME } from "@/lib/siteConfig";

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

// EPIC — Kart Yazı Tipi Seçenekleri: "Daktilo" (typewriter) option — the
// same self-hosted-at-build-time next/font/google mechanism as the three
// fonts above, so this never depends on a runtime CDN either. Geist's own
// monospace companion, chosen deliberately over a generic monospace stack
// so it visually pairs with `--font-geist-sans` ("Modern") the way Fraunces
// ("Klasik") and Caveat ("El Yazısı") already pair with this design system.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * `viewportFit: "cover"` lets the page use the whole screen on devices with
 * a notch / Dynamic Island / home indicator, and on Android edge-to-edge —
 * and is what makes `env(safe-area-inset-*)` report real values (they're 0
 * without it). Every edge that touches the screen then pads itself with
 * the --safe-* tokens (styles/tokens.css): the header, footer, page
 * gutters, board controls, dialogs. Zoom stays enabled (no maximumScale /
 * userScalable) for accessibility.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// MB-01: the default locale's (`tr`) — what the server HTML, and so every
// link-preview crawler, carries; LocalizedSiteMeta swaps in the viewer's
// language after hydration. `title`/`description` are the brand message
// ("AKLINDA KALMASIN. …"), defined per locale in `siteMeta`.
const SITE_META = getDictionary(defaultLocale).siteMeta;
const OG_LOCALES: Record<string, string> = { tr: "tr_TR", en: "en_US", de: "de_DE", fr: "fr_FR", es: "es_ES" };

export const metadata: Metadata = {
  // Resolves relative OG/Twitter image URLs (opengraph-image.tsx files)
  // and relative `alternates.canonical`/`openGraph.url` values (this file
  // and every route below) into absolute ones — see getAppUrl() for the
  // env-var precedence and production fallback.
  metadataBase: getAppUrl(),
  title: { default: SITE_META.title, template: `%s — ${SITE_NAME}` },
  description: SITE_META.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_META.title,
    description: SITE_META.description,
    url: "/",
    locale: OG_LOCALES[defaultLocale],
    alternateLocale: Object.entries(OG_LOCALES)
      .filter(([code]) => code !== defaultLocale)
      .map(([, ogLocale]) => ogLocale),
  },
  twitter: { card: "summary_large_image", title: SITE_META.title, description: SITE_META.description },
  // Staging: noindex on every page, on top of robots.ts disallowing everything.
  ...(isStaging() ? { robots: { index: false, follow: false } } : {}),
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
      className={`${geistSans.variable} ${fraunces.variable} ${caveat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <StructuredData />
        <LocaleProvider>
          <LocalizedSiteMeta />
          <SignInOptionsProvider appleEnabled={getAuthRuntimeConfig().appleEnabled}>
            <SiteHeader />
            {/* A page that should fill the space down to the footer (the homepage) marks its root `data-fill-main`; every other page is laid out as before. */}
            <main className="flex-1 has-[>[data-fill-main]]:flex has-[>[data-fill-main]]:flex-col">{children}</main>
            <SiteFooter />
            <OnboardingModal />
          </SignInOptionsProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
