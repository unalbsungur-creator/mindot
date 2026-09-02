import Link from "next/link";
import type { ReactNode } from "react";

/**
 * MINDOT's signature primary CTA — deliberately not the generic `Button`
 * component: EPIC "Tek Sayfalık Final Landing Page" asked for a
 * note-writing metaphor a visitor recognizes on sight ("if I click this,
 * I'm about to write something"), not a plain rectangle or pill. The
 * folded top-right corner reuses the exact clip-path already used for a
 * real note's "folded" template (see Note.tsx's `shape === "folded"`
 * treatment) rather than inventing a second paper motif — this button
 * literally looks like a note. A small pen mark (left) and a filled dot
 * (right, the brand's own "nokta") bookend the label. One hover state
 * (lift + soft glow), no gradient — kept deliberately restrained per that
 * EPIC's "not an oversized pill, not a plain outline rectangle, no heavy
 * animation" constraints. Used for both the hero's primary CTA and the
 * header's main action (EPIC: Ana Sayfa Yerleşim ve Navigasyon Final
 * Düzenlemesi — reused rather than a second bespoke button) — both are
 * dark navy backgrounds, which `ring-offset-navy` assumes.
 */
export function DotCtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative inline-flex min-h-12 items-center gap-3 rounded-xl bg-orange py-3 pl-5 pr-6 font-medium text-navy shadow-[0_2px_10px_rgba(255,106,0,0.3)] transition-all duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-orange-soft hover:shadow-[0_12px_28px_rgba(255,106,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      {/* Folded corner — the same "this is a note" motif Note.tsx uses. */}
      <span
        aria-hidden="true"
        className="absolute right-0 top-0 h-4 w-4 rounded-tr-xl bg-navy/15 [clip-path:polygon(100%_0,0_0,100%_100%)]"
      />
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-navy">
        <path d="M13.6 2.4a1.7 1.7 0 0 1 2.4 0l1.6 1.6a1.7 1.7 0 0 1 0 2.4L8.3 15.7l-4.6 1 1-4.6 8.9-9.7Z" />
      </svg>
      <span>{children}</span>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-navy" />
    </Link>
  );
}
