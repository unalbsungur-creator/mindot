"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DotCtaButton } from "@/components/ui/DotCtaButton";
import { useLocale } from "@/i18n/LocaleProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PageContainer } from "./PageContainer";

type HeaderUser = { name: string | null; image: string | null; isAdmin: boolean } | null;

/**
 * EPIC: Global HOME Navigasyonu — that EPIC's own text emphasizes "ana
 * sayfa (/) DIŞINDA... TÜM ana kullanıcı ekranlarında" (ALL screens,
 * capitalized in the original) and explicitly asks that any other
 * user-reachable page beyond the four named examples (/board, /about,
 * /write, /admin) be evaluated too. A hand-maintained allowlist can't
 * keep that promise as new routes get added, so this is the complete,
 * self-maintaining rule instead: show it everywhere except the homepage
 * itself (which never needs a way back to itself).
 */
function shouldShowHomeButton(pathname: string): boolean {
  return pathname !== "/";
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path
        d="M3 9.5 10 3l7 6.5M4.75 8v8h10.5V8"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The one shared "return to home" control — rendered from within
 * `SiteHeader` (the layout every user-facing page already shares) rather
 * than a duplicated component pasted into /board and /about individually.
 * Icon-only by design (the EPIC that introduced this explicitly didn't
 * want a text-heavy "HOME" button); `title`/`aria-label` reuse the
 * existing `states.home` dictionary string rather than adding a new key
 * for the same meaning.
 */
function HomeLink({ label }: { label: string }) {
  return (
    <Link
      href="/"
      aria-label={label}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/80 transition-colors hover:border-orange/50 hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
    >
      <HomeIcon className="h-5 w-5" />
    </Link>
  );
}

/**
 * A small pinboard mark for the "Duvar" nav item — a thin-lined board
 * frame (the "wall" itself) containing three irregularly scattered,
 * visibly tilted notes (echoing Note.tsx's own scattered-notes
 * composition), one accented orange as the "pinned" thought. Rejected an
 * earlier version built from four evenly-spaced, barely-rotated squares:
 * at real header size it read as a generic app-launcher/grid icon
 * (confirmed by a real zoomed screenshot, not assumed) — exactly what
 * this symbol must not be. This version deliberately breaks grid
 * alignment (uneven positions, overlap, stronger rotation angles) and
 * adds the board's own outline so the "wall/board" reading doesn't depend
 * on the viewer already knowing the word "Duvar." Inline SVG, same
 * pattern as MeaningStrip's icon functions — no new asset file.
 */
function WallIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 24" className={className}>
      <rect x="1.5" y="1.5" width="25" height="21" rx="3" className="fill-none stroke-white/25" strokeWidth={1.4} />
      <rect x="4" y="9.5" width="9" height="7.5" rx="1.2" className="fill-white/30" transform="rotate(-11 8.5 13.25)" />
      <rect x="15" y="3.5" width="9" height="7.5" rx="1.2" className="fill-orange" transform="rotate(9 19.5 7.25)" />
      <rect x="13.5" y="12" width="9" height="7.5" rx="1.2" className="fill-white/20" transform="rotate(-6 18 15.75)" />
    </svg>
  );
}

/**
 * "Duvar" as one cohesive object — icon and label inside a single
 * thin-bordered chip, not an icon next to a separate text link. Hover is
 * restrained on purpose (a hairline border brightening to orange + a very
 * slight lift), never a heavy shadow/gradient — the EPIC that introduced
 * this explicitly asked for "sakin ve premium," not an aggressive glow.
 */
function WallNavLink({ label }: { label: string }) {
  return (
    <Link
      href="/board"
      className="group inline-flex items-center gap-2.5 rounded-lg border border-white/15 px-3 py-2 text-base font-semibold text-white/85 transition-all duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-orange/50 hover:text-white hover:shadow-[0_4px_16px_rgba(255,106,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:text-lg lg:text-xl"
    >
      <WallIcon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-105 sm:h-6 sm:w-6" />
      {label}
    </Link>
  );
}

/**
 * EPIC: Ana Sayfa Yerleşim ve Navigasyon Final Düzenlemesi — the header no
 * longer shows a logo image at all (removed entirely, not shrunk). Three
 * zones instead: primary nav on the left — "Duvar" as a single bordered
 * icon+label object (`WallNavLink`, above) rather than a plain text link,
 * "Hakkında" staying a plain but large/bold link (EPIC: Hero Mesajı ve
 * DUVAR Navigasyon Sembolü Düzeltmesi — Duvar gets the visual symbol,
 * Hakkında deliberately stays simpler) — the site's one primary action
 * (`DotCtaButton`, reused rather than a second bespoke button) centered as
 * the visual focal point, and a right-hand cluster (admin link when
 * applicable, avatar when signed in, language switcher always last)
 * anchoring the far right. Below `lg:` the centered CTA drops into its own
 * full-width row beneath the main bar instead of squeezing into it —
 * inline at that width risks wrapping against the nav/right cluster on a
 * narrow tablet.
 */
export function SiteHeader() {
  const { dictionary } = useLocale();
  const pathname = usePathname();
  const showHomeButton = pathname !== null && shouldShowHomeButton(pathname);
  // Fetched client-side, not passed down from the root layout, so pages
  // that don't otherwise need per-request data (the homepage) can stay
  // statically prerendered instead of every page becoming dynamic just to
  // know whether to show an avatar — see app/api/session/summary.
  const [user, setUser] = useState<HeaderUser>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session/summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="sticky top-0 z-[var(--z-header)] border-b border-white/10 bg-navy/95 backdrop-blur supports-[backdrop-filter]:bg-navy/90">
      <PageContainer className="flex h-16 items-center justify-between gap-4 lg:h-20">
        <nav aria-label="Primary" className="flex items-center gap-3 lg:gap-6">
          {showHomeButton && <HomeLink label={dictionary.states.home} />}
          <WallNavLink label={dictionary.nav.wall} />
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center text-base font-semibold text-white/85 transition-colors hover:text-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:text-lg lg:text-xl"
          >
            {dictionary.nav.about}
          </Link>
        </nav>

        <div className="hidden flex-1 justify-center lg:flex">
          <DotCtaButton href="/write">{dictionary.nav.writeThought}</DotCtaButton>
        </div>

        <div className="flex items-center gap-3">
          {user?.isAdmin && (
            // Discoverability only, not the security boundary — every
            // /admin/* page and Server Function independently re-checks
            // session.user.role === "admin" itself regardless of whether
            // this link is visible. See /api/session/summary.
            <Button href="/admin" variant="outline" size="sm">
              {dictionary.nav.admin}
            </Button>
          )}
          {user && (
            <Link
              href="/me"
              aria-label={dictionary.nav.myMindot}
              title={dictionary.nav.myMindot}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-surface text-xs font-medium text-navy transition-colors hover:border-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
            >
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- tiny (36px) decorative avatar from an arbitrary Google profile URL, same call as Note's own author avatar
                <img src={user.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              ) : (
                (user.name?.[0] ?? "M").toUpperCase()
              )}
            </Link>
          )}
          {/* Always the rightmost element, at every breakpoint. */}
          <LanguageSwitcher />
        </div>
      </PageContainer>

      {/* Below lg:, the centered CTA gets its own full-width row instead
          of squeezing into the main bar next to nav + the right cluster. */}
      <div className="flex justify-center border-t border-white/10 px-4 py-2.5 lg:hidden">
        <DotCtaButton href="/write">{dictionary.nav.writeThought}</DotCtaButton>
      </div>
    </header>
  );
}
