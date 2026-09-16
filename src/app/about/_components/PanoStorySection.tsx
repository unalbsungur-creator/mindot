import Image from "next/image";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/translations/types";

const PHOTOS = [
  { src: "/images/pano/pano-1.jpg", rotate: "-3deg", overlap: "sm:-mr-6 lg:-mr-10" },
  { src: "/images/pano/pano-2.jpg", rotate: "1deg", overlap: "" },
  { src: "/images/pano/pano-3.jpg", rotate: "2deg", overlap: "sm:-ml-6 lg:-ml-10" },
] as const;

/**
 * EPIC 036: the three real, ~33-34-year-old physical Pano photographs —
 * archival material, never generated/re-drawn/stock. Presented as an
 * editorial "photos on a desk" composition (slight rotation + overlap +
 * shadow) rather than a plain image grid, per that EPIC's brief — but
 * every photo renders at its full natural aspect ratio (no `object-cover`
 * crop), so no breakpoint can ever clip real content like the large
 * "PANO" lettering or the handwritten margins.
 *
 * Rotation/overlap apply only from `sm:` up (a real, intentional design
 * choice, not an oversight) — below that, photos stack in plain document
 * flow at `rotate-0`, exactly the "clean, non-overflowing vertical layout"
 * Part 8 of that EPIC asked for on mobile.
 *
 * EPIC 037: casual right-click-save / drag-out is discouraged on these
 * three photos specifically — `onContextMenu`/`onDragStart` are
 * `preventDefault()`-ed only on each photo's own frame, never on
 * `document` or any ancestor, so right-click and drag stay completely
 * normal everywhere else on this page and site (the existing story text,
 * the CTA button, any other image). This is a deliberate, narrow
 * deterrent against the ordinary browser "Save image as…"/drag-to-desktop
 * paths — not a real technical barrier (a determined visitor always has
 * DevTools/network inspection available) — and deliberately not paired
 * with any visual change (no watermark/blur/opacity/filter/canvas
 * re-encode): the pixels a visitor sees are the real, unaltered archive
 * photo, exactly as before this EPIC.
 */
export function PanoStorySection({ t, slogan }: { t: Dictionary["panoStory"]; slogan: string }) {
  return (
    <section className="border-t border-border pt-12 sm:pt-16">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 text-center">
        <h2 className="font-display text-2xl font-medium text-navy sm:text-3xl">{t.heading}</h2>
        <p className="font-display text-lg italic text-ink-soft">{t.lead}</p>
      </div>

      <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center gap-6 sm:mt-12 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-0">
        {PHOTOS.map((photo, index) => (
          <div
            key={photo.src}
            className={cn(
              "relative w-full shrink-0 rounded-sm bg-surface p-2 shadow-card ring-1 ring-border/60 transition-transform duration-[var(--motion-base)] sm:rotate-[var(--pano-rotate)] hover:z-10 hover:rotate-0",
              photo.overlap
            )}
            // EPIC 036: `maxWidth`/`--pano-rotate` are plain inline
            // style/custom-property, not `max-w-[280px]`/named `rotate-*`
            // classes — arbitrary pixel-bracket utilities and every
            // transform utility (named or arbitrary) were confirmed not
            // compiling in this dev environment right now (verified
            // directly: simple color/spacing/named-scale utilities and
            // CSS-var z-index all resolved fine, but max-w-[280px],
            // rotate-3, -translate-y-1, and rotate-[var(--x)] all computed
            // to no-op). `rotate-[var(--pano-rotate)]` mirrors Note.tsx's
            // own already-working `rotate-[var(--note-rotate)]` pattern —
            // same mechanism, verified live in the rendered page, not a
            // synthetic detached-element test.
            style={{ maxWidth: 280, zIndex: index === 1 ? 10 : index, "--pano-rotate": photo.rotate } as React.CSSProperties}
            onContextMenu={(event) => event.preventDefault()}
            onDragStart={(event) => event.preventDefault()}
          >
            <Image
              src={photo.src}
              alt={t.photoAlt[index]}
              width={1200}
              height={1600}
              className="h-auto w-full rounded-sm"
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 40vw, 80vw"
              draggable={false}
            />
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 text-center sm:mt-12">
        {t.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-ink-soft">
            {paragraph}
          </p>
        ))}
        <p className="font-display text-xl font-medium text-navy">{t.origin}</p>
        <p className="text-ink-soft">{t.closing}</p>
        {/* EPIC 036: the closing emphasis reuses boardPage.slogan (the same
            "Aklında kalmasın." already shown, faintly, at the board's world
            origin) rather than a duplicated third copy of that string. */}
        <p className="font-display text-2xl font-medium text-orange sm:text-3xl">{slogan}</p>
      </div>
    </section>
  );
}
