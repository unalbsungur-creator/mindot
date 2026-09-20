"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * BUG FIX: DUVAR Tooltip Clipping. The visual label for a note's optional
 * secondary actions ("Bu düşünceyi sakla" / "Paylaş" / "Bildir") used to be
 * an absolutely positioned `-top-7` `<span>` sitting *inside* Note's own
 * shape wrapper — and two independent ancestors cropped it, which is why
 * the text was visibly cut off on some cards:
 *
 * 1. Every `clip-path` shape class ("torn"/"tag"/"craft"/"frost"/
 *    "diploma"/"ribbon", plus the heart's own `clipPath: url(#…)`) clips
 *    its *entire rendered subtree* to that polygon — `overflow` is
 *    irrelevant to `clip-path`. A tooltip rendered above the card's top
 *    edge is outside the polygon, so it was clipped to whatever sliver of
 *    it still fell inside the shape (worst on circular/rounded and rotated
 *    cards, whose usable area is furthest from the top-right corner the
 *    toolbar lives in).
 * 2. `InfiniteBoard`'s own viewport is `overflow-hidden` (the board must
 *    not scroll when a note is panned past its edge), so a tooltip on a
 *    note near the board's top or right edge was cropped by the *board*
 *    box even where no shape clip-path was involved.
 *
 * Rendered through a portal into `document.body` under `position: fixed`,
 * the tooltip is a descendant of neither, so no shape, rotation, or board
 * edge can crop it.
 *
 * Positioning is measured from the anchor's own
 * `getBoundingClientRect()` — a *viewport* rectangle — so the note's
 * `rotate`/`translate`/world transform, the board camera's own transform,
 * and page scroll all fall out of the maths: whatever those do, the rect is
 * where the button actually is on screen. Nothing about the note's own
 * geometry (size, rotation, position, placement footprint, clip-path) is
 * touched — and Note's clipping behaviour is left exactly as it was, rather
 * than being globally loosened to `overflow-visible`.
 *
 * Behaviour is deliberately identical to the CSS-driven version it
 * replaces (mouse hover in/out, keyboard focus/blur), including the fact
 * that it stays a mouse/keyboard-only affordance: touch never opens it,
 * since there is no true hover on a touchscreen and the buttons themselves
 * are already permanently visible there (see Note's `active` prop).
 */

/** Minimum breathing room kept between the tooltip and a viewport edge. */
const VIEWPORT_MARGIN_PX = 4;

/**
 * The replaced span's own `-top-7` offset (`1.75rem` = 28px above the
 * button's top edge) — reproduced exactly against the button's real
 * viewport rect, so the visual placement is unchanged wherever the note
 * ends up on screen.
 */
const ABOVE_OFFSET_PX = 28;
/** Only used when there is no room above the button (a note at the viewport's top edge). */
const BELOW_OFFSET_PX = 6;

interface NoteActionTooltipProps {
    /**
     * The action's label — also the button's own `aria-label`, so it is
     * already announced; this component's copy is a visual-only affordance
     * and stays `aria-hidden`.
     */
    label: string;
    /** The action button/link itself, kept in its original toolbar position. */
    children: ReactNode;
}

export function NoteActionTooltip({ label, children }: NoteActionTooltipProps) {
    const anchorRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    /**
     * `null` until the first measurement lands. Deliberately *not* a default
     * `{ top: 0, left: 0 }`: the tooltip renders invisible until a real rect
     * is known, so a stale position is never shown for a frame.
     */
    const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);

    const place = useCallback(() => {
        const anchor = anchorRef.current;
        const tooltip = tooltipRef.current;
        if (!anchor || !tooltip) return;

        const anchorRect = anchor.getBoundingClientRect();
        // Measured with the tooltip mounted but still `opacity-0` — opacity
        // doesn't affect layout, so this is its real rendered size.
        const { width, height } = tooltip.getBoundingClientRect();

        // Horizontally centred on the button, then clamped so the tooltip can
        // never leave the viewport (left edge yields to the right margin and
        // vice versa).
        const maxLeft = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - width - VIEWPORT_MARGIN_PX);
        const left = Math.min(
            Math.max(anchorRect.left + anchorRect.width / 2 - width / 2, VIEWPORT_MARGIN_PX),
            maxLeft
        );

        // Preferred: above the button (the original look). No room up there —
        // a note near the viewport's top edge — → below it instead; and if the
        // viewport is too short for either, the final clamp keeps it on screen.
        const above = anchorRect.top - ABOVE_OFFSET_PX;
        const maxTop = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - height - VIEWPORT_MARGIN_PX);
        const top = Math.min(
            Math.max(above >= VIEWPORT_MARGIN_PX ? above : anchorRect.bottom + BELOW_OFFSET_PX, VIEWPORT_MARGIN_PX),
            maxTop
        );

        setPlacement({ top, left });
    }, []);

    // Layout effect (not a passive effect): the tooltip is already in the DOM
    // at this point, and measuring here means the first paint after a
    // hover/focus already has the correct position — no visible jump.
    useLayoutEffect(() => {
        if (visible) place();
    }, [visible, place]);

    // A rotated/absolutely positioned note moves under a stationary cursor
    // when the page (or any scroll container) scrolls, and a resize can
    // invalidate an edge clamp — keep the tooltip glued to its button.
    useEffect(() => {
        if (!visible) return;
        const reposition = () => place();
        window.addEventListener("resize", reposition);
        // Capture phase: the scroll happens on some ancestor scroll container,
        // not necessarily on `window` itself, and scroll events don't bubble.
        window.addEventListener("scroll", reposition, true);
        return () => {
            window.removeEventListener("resize", reposition);
            window.removeEventListener("scroll", reposition, true);
        };
    }, [visible, place]);

    const hide = useCallback(() => {
        setVisible(false);
        // Reset so the next reveal re-measures instead of reusing this
        // position for the frame before the layout effect runs.
        setPlacement(null);
    }, []);

    return (
        <div
            ref={anchorRef}
            // `relative` (unchanged from the wrapper this replaces) keeps the
            // button in its original toolbar slot; the wrapper is now purely the
            // tooltip's anchor, which is why it no longer needs a named group.
            className="relative"
            onPointerEnter={(event) => {
                // Touch has no real hover — and its buttons are always visible via
                // Note's own `pointer-coarse:` rules — so a tap must not pop a
                // tooltip that the user then can't dismiss.
                if (event.pointerType !== "touch") setVisible(true);
            }}
            onPointerLeave={hide}
            // Mouse and keyboard focus both land here, exactly as the replaced
            // `group-focus-within:` variant did.
            onFocus={() => setVisible(true)}
            onBlur={hide}
        >
            {children}
            {visible &&
                createPortal(
                    // `aria-hidden` — the anchor's own `aria-label` already carries
                    // this text as the accessible name; this span is a purely visual
                    // affordance.
                    <span
                        ref={tooltipRef}
                        aria-hidden="true"
                        style={{
                            position: "fixed",
                            top: placement?.top ?? 0,
                            left: placement?.left ?? 0,
                        }}
                        // `pointer-events-none`: a tooltip must never steal the hover
                        // that is keeping it open, nor intercept a click meant for the
                        // button beneath it. `z-[var(--z-overlay)]` (the tokens' true
                        // overlay layer) so a board note's tooltip is never painted
                        // under the sticky header either.
                        className={
                            // `max-w-[calc(100vw-0.5rem)]` is a last-resort belt to the
                            // clamp above: every real label in every locale
                            // ("Bu düşünceyi sakla" and its translations) renders on one
                            // line exactly as it used to, but a label that could ever be
                            // wider than the viewport wraps inside the margin instead of
                            // being clamped to a left edge it would then spill past.
                            "pointer-events-none z-[var(--z-overlay)] max-w-[calc(100vw-0.5rem)] rounded-sm bg-navy px-1.5 py-1 text-[10px] font-medium text-white shadow-card transition-opacity duration-[var(--motion-fast)] " +
                            (placement ? "opacity-100" : "opacity-0")
                        }
                    >
                        {label}
                    </span>,
                    document.body
                )}
        </div>
    );
}
