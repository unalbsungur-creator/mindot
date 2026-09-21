"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { StarField } from "@/components/ui/StarField";
import { cn } from "@/lib/cn";
import { getAnonymousId } from "@/lib/anonymousId";
import { useLocale } from "@/i18n/LocaleProvider";
import { likeMessage } from "@/features/messages/like-actions";
import { ReportDialog } from "@/features/reports/components/ReportDialog";
import type { BoardTile } from "../types";
import type { BoardFilterResult } from "./BoardDiscoveryPanel";
import { useBoardCamera } from "../hooks/useBoardCamera";
import { useTileCache } from "../hooks/useTileCache";
import {
  clampZoom,
  DEFAULT_ZOOM,
  TILE_PX,
  visibleTileRange,
  worldTransform,
  zoomTowardScreenPoint,
  type Camera,
} from "../lib/worldGeometry";
import { BoardControls } from "./BoardControls";
import { BoardCenterMark } from "./BoardCenterMark";

const KEY_PAN_SPEED = 480; // world px/sec
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
const BUTTON_ZOOM_STEP = 0.25;
const EMPTY_HINT_DELAY_MS = 4000;
// EPIC: Message Like System — which message ids *this browser* has
// already liked, purely a client UX convenience (don't show a likeable
// button as clickable again) — the real dedup guarantee is server-side,
// see message_likes' unique index. Wrapped in try/catch like every other
// localStorage read in this codebase.
const LIKED_STORAGE_KEY = "mindot:liked-messages:v1";
// EPIC 026: this canvas is a drag-to-pan world, not a normal scrolling
// page — by design (see CLAUDE.md's "Infinite board interaction model"),
// never touched here. On a real mobile device that's not obvious without
// the mouse-cursor/scrollbar affordances desktop has, and was reported as
// "no posts visible, can't scroll" — this one-time hint (shown once per
// browser, same versioned-key convention as onboarding/liked-messages
// above) is the minimal, purely-additive fix: it doesn't change how the
// board loads or renders content, only tells a first-time mobile visitor
// how to move around it.
const MOBILE_HINT_STORAGE_KEY = "mindot:board-mobile-hint-seen:v1";

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function tileToNoteData(message: BoardTile["messages"][number]): NoteData {
  return {
    id: message.id,
    content: message.content,
    authorName: message.author?.displayName ?? "",
    authorImage: message.author?.image ?? null,
    templateId: message.templateId,
    fontFamily: message.fontFamily,
    size: "md",
    rotation: message.rotation,
    position: { top: `${message.position.y * 100}%`, left: `${message.position.x * 100}%` },
    language: message.language,
  };
}

export function InfiniteBoard({
  initialTile,
  centerPoint,
  focusPoint,
  onFocusHandled,
  filter,
}: {
  initialTile?: BoardTile;
  /** Where "return to center" goes — see useBoardCamera's own doc comment. */
  centerPoint: { x: number; y: number };
  /**
   * EPIC 021: board discovery's "view on board" action — when set to a
   * world-space point, the camera jumps there once (see the effect below),
   * then `onFocusHandled()` clears it so the same point isn't re-applied
   * on every unrelated re-render. `undefined`/`null` is a no-op — every
   * existing pan/zoom/keyboard/URL-restore code path above is untouched.
   */
  focusPoint?: { x: number; y: number } | null;
  onFocusHandled?: () => void;
  /**
   * EPIC — Duvar İçi Filtreleme: `BoardDiscoveryPanel`'s current keyword/
   * date/category outcome, relayed through `BoardPageContent`. This never
   * changes *how* a tile's messages are fetched/positioned — `tileCache`
   * below is completely unaware a filter exists. It only decides, per
   * already-rendered message, whether to render its `Note` at all (see
   * the `matchedIds` check in the tile-map loop): `matchedIds === null`
   * renders everything, exactly as before this EPIC; a non-null Set
   * hides any message whose id isn't in it. World-space position, tile
   * membership, rotation, size — none of it is touched, so a hidden
   * card's coordinates are exactly what they were the moment the filter
   * clears. Optional so any other future caller of `InfiniteBoard` that
   * doesn't need filtering can simply omit it.
   */
  filter?: BoardFilterResult;
}) {
  const { dictionary } = useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const { camera, setCamera, zoomTo, resetToCenter } = useBoardCamera(centerPoint);

  // Applied live to the DOM during drag/zoom for smooth 60fps feedback,
  // independent of React's render cycle — see applyTransform/scheduleCommit.
  // Kept current by applyTransform itself (below), which every gesture
  // handler and the outside-gesture sync effect both go through.
  const liveCameraRef = useRef<Camera>(camera);

  // True for the duration of an active drag/pinch/held-key gesture. Guards
  // the sync effect below so a rAF-throttled state commit mid-gesture never
  // re-applies a slightly-stale transform on top of a position the user has
  // already dragged past — see that effect for why this matters.
  const isGesturingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleTiles = useMemo(
    () => (viewport.width > 0 ? visibleTileRange(camera, viewport.width, viewport.height) : []),
    [camera, viewport.width, viewport.height]
  );

  const tileCache = useTileCache(visibleTiles, initialTile);

  const applyTransform = useCallback(
    (next: Camera) => {
      liveCameraRef.current = next;
      if (worldRef.current) {
        worldRef.current.style.transform = worldTransform(next, viewport.width, viewport.height);
      }
    },
    [viewport.width, viewport.height]
  );

  // rAF-throttled commit to React state, so drag/zoom feels instant (DOM
  // mutated directly) while tile-visibility recalculation still happens
  // progressively, not just at the end of the gesture.
  const commitScheduled = useRef(false);
  const scheduleCommit = useCallback(() => {
    if (commitScheduled.current) return;
    commitScheduled.current = true;
    requestAnimationFrame(() => {
      commitScheduled.current = false;
      setCamera(liveCameraRef.current);
    });
  }, [setCamera]);

  // --- Pointer drag (mouse + touch, unified) and pinch-to-zoom ---
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; camera: Camera } | null>(null);
  const pinchStart = useRef<{ distance: number; camera: Camera } | null>(null);

  // EPIC 026: one-time mobile gesture hint — see MOBILE_HINT_STORAGE_KEY above.
  const [showMobileHint, setShowMobileHint] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage read, same justified exception as the liked-messages restore below
      if (!window.localStorage.getItem(MOBILE_HINT_STORAGE_KEY)) setShowMobileHint(true);
    } catch {
      // Private mode / blocked storage — hint just won't persist as "seen"; harmless to show again.
    }
  }, []);
  const dismissMobileHint = useCallback(() => {
    setShowMobileHint(false);
    try {
      window.localStorage.setItem(MOBILE_HINT_STORAGE_KEY, "1");
    } catch {
      // Fine — worst case the hint reappears next visit in this browser.
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      isGesturingRef.current = true;
      dismissMobileHint();

      if (pointers.current.size === 1) {
        dragStart.current = { x: event.clientX, y: event.clientY, camera: liveCameraRef.current };
      } else if (pointers.current.size === 2) {
        dragStart.current = null;
        const [a, b] = [...pointers.current.values()];
        pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), camera: liveCameraRef.current };
      }
    },
    [dismissMobileHint]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.current.size === 2 && pinchStart.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const ratio = distance / (pinchStart.current.distance || 1);
        const nextZoom = clampZoom(pinchStart.current.camera.zoom * ratio);
        const rect = containerRef.current?.getBoundingClientRect();
        const localX = midX - (rect?.left ?? 0);
        const localY = midY - (rect?.top ?? 0);
        applyTransform(
          zoomTowardScreenPoint(pinchStart.current.camera, nextZoom, localX, localY, viewport.width, viewport.height)
        );
        scheduleCommit();
        return;
      }

      if (pointers.current.size === 1 && dragStart.current) {
        const dx = event.clientX - dragStart.current.x;
        const dy = event.clientY - dragStart.current.y;
        applyTransform({
          x: dragStart.current.camera.x - dx / dragStart.current.camera.zoom,
          y: dragStart.current.camera.y - dy / dragStart.current.camera.zoom,
          zoom: dragStart.current.camera.zoom,
        });
        scheduleCommit();
      }
    },
    [applyTransform, scheduleCommit, viewport.width, viewport.height]
  );

  const endPointer = useCallback(
    (event: React.PointerEvent) => {
      pointers.current.delete(event.pointerId);
      dragStart.current = null;
      pinchStart.current = null;
      if (pointers.current.size === 0) {
        isGesturingRef.current = false;
        setCamera(liveCameraRef.current);
      }
    },
    [setCamera]
  );

  // --- Wheel zoom: needs a native, non-passive listener to preventDefault ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const rect = el!.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const nextZoom = clampZoom(liveCameraRef.current.zoom * factor);
      const next = zoomTowardScreenPoint(liveCameraRef.current, nextZoom, localX, localY, viewport.width, viewport.height);
      applyTransform(next);
      setCamera(next);
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [applyTransform, setCamera, viewport.width, viewport.height]);

  // --- Keyboard: arrow keys + WASD, smooth continuous movement via rAF ---
  useEffect(() => {
    const held = new Set<string>();
    let rafId: number | null = null;
    let lastTime: number | null = null;

    function frame(time: number) {
      if (lastTime === null) lastTime = time;
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      let dx = 0;
      let dy = 0;
      held.forEach((key) => {
        const dir = MOVE_KEYS[key];
        if (dir) {
          dx += dir[0];
          dy += dir[1];
        }
      });

      if (dx !== 0 || dy !== 0) {
        const magnitude = Math.hypot(dx, dy) || 1;
        const step = (KEY_PAN_SPEED * dt) / magnitude;
        const next = {
          ...liveCameraRef.current,
          x: liveCameraRef.current.x + dx * step,
          y: liveCameraRef.current.y + dy * step,
        };
        applyTransform(next);
        scheduleCommit();
      }

      rafId = held.size > 0 ? requestAnimationFrame(frame) : null;
      if (!rafId) lastTime = null;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (!MOVE_KEYS[key]) return;
      event.preventDefault();
      if (!held.has(key)) {
        held.add(key);
        isGesturingRef.current = true;
        if (rafId === null) rafId = requestAnimationFrame(frame);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      held.delete(key);
      if (held.size === 0) isGesturingRef.current = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [applyTransform, scheduleCommit]);

  // --- Control buttons ---
  const handlePanButton = useCallback(
    (dx: number, dy: number) => {
      const next = { ...camera, x: camera.x + dx, y: camera.y + dy };
      applyTransform(next);
      setCamera(next);
    },
    [camera, applyTransform, setCamera]
  );

  const handleZoomButton = useCallback(
    (delta: number) => {
      const next = zoomTowardScreenPoint(
        camera,
        clampZoom(camera.zoom + delta),
        viewport.width / 2,
        viewport.height / 2,
        viewport.width,
        viewport.height
      );
      applyTransform(next);
      zoomTo(next);
    },
    [camera, viewport.width, viewport.height, applyTransform, zoomTo]
  );

  // Keeps the DOM transform in sync on mount, on viewport resize, and after
  // a non-gesture camera change (buttons, return-to-center, URL restore).
  // Skipped while a gesture is active: those handlers already call
  // applyTransform directly on every move, and re-applying the
  // (rAF-delayed, therefore slightly stale) committed `camera` here mid-drag
  // would visibly fight with a position the user has already moved past.
  useEffect(() => {
    if (isGesturingRef.current) return;
    applyTransform(camera);
  }, [camera, viewport.width, viewport.height, applyTransform]);

  // EPIC 021: board discovery's "view on board" jump — a one-shot camera
  // move to a search result's coordinates, deliberately separate from
  // resetToCenter/pan/zoom above so none of that existing logic needs to
  // change. `onFocusHandled` is called synchronously in the same effect so
  // this never re-fires for the same point.
  useEffect(() => {
    if (!focusPoint) return;
    const next: Camera = { x: focusPoint.x, y: focusPoint.y, zoom: DEFAULT_ZOOM };
    applyTransform(next);
    setCamera(next);
    onFocusHandled?.();
  }, [focusPoint, applyTransform, setCamera, onFocusHandled]);

  // --- Empty-region hint: quiet, appears only after sustained emptiness ---
  const visibleMessageCount = useMemo(() => {
    let count = 0;
    visibleTiles.forEach((coord) => {
      const entry = tileCache.get(`${coord.x},${coord.y}`);
      count += entry?.tile?.messages.length ?? 0;
    });
    return count;
  }, [visibleTiles, tileCache]);

  const anyTileLoading = visibleTiles.some((coord) => tileCache.get(`${coord.x},${coord.y}`)?.status === "loading");
  const anyTileError = visibleTiles.some((coord) => tileCache.get(`${coord.x},${coord.y}`)?.status === "error");

  const [isResetting, setIsResetting] = useState(false);
  const handleReturnToCenter = useCallback(() => {
    setIsResetting(true);
    resetToCenter();
    window.setTimeout(() => setIsResetting(false), 500);
  }, [resetToCenter]);

  // --- Likes: real count comes from tile data; `likedIds` and
  // `likeCountOverrides` are purely local optimistic-UI state, reconciled
  // with the server's actual response once it arrives.
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likeCountOverrides, setLikeCountOverrides] = useState<Record<string, number>>({});

  // EPIC 012: one shared ReportDialog instance for the whole board, rather
  // than one per note — `reportingMessageId` says which message the
  // currently-open dialog (if any) is about; `null` means closed.
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);

  // EPIC 040: Mobile Note Card Actions: Tap-to-Reveal. One board-wide id,
  // not per-note local state — guarantees at most one note's actions can
  // ever be visible on a touchscreen at a time (tapping a new card
  // implicitly closes whichever one was open, since only one id can be
  // "current"). Desktop's mouse hover/keyboard-focus reveal (Note.tsx's
  // `group-hover:`/`group-focus-within:`) is completely independent of
  // this state — see Note.tsx's own EPIC 040 comments.
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Tapping empty board space (canvas, a tile's background, BoardControls,
  // anywhere that isn't a note) clears the active card. Checked via
  // `closest` rather than `event.target === event.currentTarget` because a
  // tap that lands on a tile's background `<div>` (not the note itself)
  // still needs to count as "outside" — `data-note-card` (Note.tsx) is the
  // one marker that means "this click originated on/inside an actual
  // note," including its own action buttons (so tapping "Paylaş" on the
  // already-active card never immediately re-closes it via this handler).
  const handleBoardBackgroundClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-note-card]")) return;
    setActiveNoteId(null);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LIKED_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLikedIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Private mode / blocked storage — likes just won't persist across reloads in this browser.
    }
  }, []);

  const handleLike = useCallback((messageId: string, currentCount: number) => {
    if (likedIds.has(messageId)) return;

    setLikedIds((prev) => {
      const next = new Set(prev).add(messageId);
      try {
        window.localStorage.setItem(LIKED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Fine — this click just won't be remembered on the next reload.
      }
      return next;
    });
    setLikeCountOverrides((prev) => ({ ...prev, [messageId]: currentCount + 1 }));

    likeMessage(messageId, getAnonymousId())
      .then((result) => {
        if (!result.ok) {
          // The message likely became unavailable (e.g. archived) between
          // render and click — revert the optimistic state.
          setLikedIds((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
          setLikeCountOverrides((prev) => ({ ...prev, [messageId]: currentCount }));
          return;
        }
        // Reconcile with the real server count (covers the already-liked-
        // in-another-tab / race case) rather than trusting the optimistic +1.
        setLikeCountOverrides((prev) => ({ ...prev, [messageId]: result.likeCount }));
      })
      .catch(() => {
        setLikedIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        setLikeCountOverrides((prev) => ({ ...prev, [messageId]: currentCount }));
      });
  }, [likedIds]);

  const [showEmptyHint, setShowEmptyHint] = useState(false);
  useEffect(() => {
    // Synchronizing with an external timer (setTimeout) is exactly the
    // "external system" case effects are for — resetting the hint whenever
    // the underlying condition changes, then re-arming the timer below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowEmptyHint(false);
    // EPIC — Duvar İçi Filtreleme: this hint means "this world region has
    // no messages at all," which isn't the right message while a filter
    // is actively hiding cards that do exist — that case gets its own
    // "eşleşen düşünce yok" hint below instead (see filterStatus/
    // filterHasNoMatches), so this one stays gated to the true unfiltered
    // empty-region case exactly as it was before this EPIC.
    const filterActive = filter != null && (filter.status === "loading" || filter.matchedIds !== null);
    if (visibleMessageCount > 0 || anyTileLoading || viewport.width === 0 || filterActive) return;
    const timeout = setTimeout(() => setShowEmptyHint(true), EMPTY_HINT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [visibleMessageCount, anyTileLoading, viewport.width, filter]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={dictionary.boardPage.ariaLabel}
      tabIndex={0}
      className="relative min-h-[32rem] flex-1 touch-none select-none overflow-hidden bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={handleBoardBackgroundClick}
    >
      {/* EPIC 038: a static, decorative star-field atmosphere (StarField,
          see src/components/ui/StarField.tsx) — deliberately a sibling of
          `worldRef` (never a child of it), so it stays fixed to the
          viewport/container and never pans or scales with the world-space
          transform applied to tiles/notes below.
          EPIC 041: EPIC 038 shipped this at `opacity={0.1}` with normal
          blending — real-browser QA confirmed that combination reads as
          essentially imperceptible against `bg-canvas`'s light cream:
          normal alpha compositing of a mostly-dark navy image at 10%
          opacity over a light base just shifts the cream a few RGB units
          cooler, with no visible star texture. Two changes fix this
          without touching cards/controls/search/center-mark/pan-zoom, and
          without turning the board into a dark theme:
          (1) a barely-there flat navy wash (`bg-navy` at 4% opacity, its
          own sibling layer, painted first so the star image composites
          over it) — deepens the base tone just enough that the star
          image's own tonal range has something to actually contrast
          against, still overwhelmingly the existing cream everywhere a
          card or control sits;
          (2) `mix-blend-mode: multiply` (see StarField.tsx's `blendMode`
          prop) instead of normal blending, at a higher `opacity={0.28}` —
          multiply darkens the canvas specifically where the source image
          is dark (its navy/black regions) while leaving lighter regions
          (the nebula glow, star points) comparatively brighter, producing
          real visible tonal variation ("atmosphere") instead of one flat
          uniform tint. Every card renders in its own fully opaque paper
          layer above this (see Note.tsx) — none of this can ever affect a
          card's own color/shadow/legibility, only the empty canvas
          between them.
          (3) THE ACTUAL ROOT CAUSE, found via real-browser testing (not
          just opacity/contrast): both this layer and StarField below use
          `zIndex={0}`, not the `-1` EPIC 038 originally shipped. `worldRef`
          just below carries an imperatively-applied `transform` (for
          60fps pan/zoom), which promotes it to its own stacking context —
          and that context was found to fully OCCLUDE any negative-z-index
          sibling behind it, not merely paint over it faintly. Confirmed by
          injecting plain positioned test elements directly into this
          container at both z-index values: `-1` was completely invisible
          regardless of DOM order, `0` (placed first in DOM order, same as
          here) rendered correctly. `0` still paints behind `worldRef` and
          everything after it (same stacking "level," DOM order decides),
          it just no longer gets excluded from painting at all. See
          StarField.tsx's own EPIC 041 comment for the full explanation —
          this is a board-only override; HomeHero/MeaningStrip have no
          transformed descendant, so their default `-1` is untouched and
          still correct. */}
      {/* Inline style (not a Tailwind opacity-[…] utility) for the exact
          same reason StarField.tsx's own inset values are inline — this
          session has repeatedly confirmed arbitrary-value Tailwind
          utilities can silently fail to compile under this project's dev
          server; an inline style has no such risk. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bg-navy"
        style={{ zIndex: 0, top: 0, right: 0, bottom: 0, left: 0, opacity: 0.02 }}
      />
      <StarField opacity={0.13} blendMode="multiply" zIndex={0} />
      {/* EPIC 042: Board Watermark Logo Replacement. Moved out from inside
          `worldRef` — this used to be a world-space element (a child of
          `worldRef`, positioned at the world origin via `TILE_PX/2`
          coordinates) that panned/scaled away with the board by design.
          The new asset-based watermark is required to behave like
          StarField instead: fixed to the viewport, never moving with
          pan/zoom. See BoardCenterMark.tsx's own EPIC 042 comment for the
          rest (asset, opacity, and the same `zIndex={0}`-not-`-1` fix
          StarField needed for the same worldRef-stacking-context reason —
          see StarField.tsx's EPIC 041 comment). */}
      <BoardCenterMark />
      <div
        ref={worldRef}
        className={cn(
          "absolute left-0 top-0 origin-top-left will-change-transform",
          isResetting && "transition-transform duration-500 ease-out"
        )}
      >
        {visibleTiles.map((coord) => {
          const entry = tileCache.get(`${coord.x},${coord.y}`);
          if (!entry?.tile) return null;
          return (
            <div
              key={`${coord.x},${coord.y}`}
              className="absolute"
              style={{ left: coord.x * TILE_PX, top: coord.y * TILE_PX, width: TILE_PX, height: TILE_PX }}
            >
              {entry.tile.messages.map((message) => {
                // EPIC — Duvar İçi Filtreleme: the one line that actually
                // implements "filtering happens in place." `matchedIds ===
                // null` means no filter is active — every message renders,
                // byte-identical to before this EPIC. A non-null Set means
                // only ids in it render; everything else about this
                // message (its tile, its `tileToNoteData` position/
                // rotation/size) is never touched, so a hidden card's
                // coordinates are exactly what they were the moment the
                // filter clears — nothing is recomputed, nothing moves.
                if (filter?.matchedIds && !filter.matchedIds.has(message.id)) return null;
                const liked = likedIds.has(message.id);
                const count = likeCountOverrides[message.id] ?? message.likeCount;
                return (
                  <Note
                    key={message.id}
                    note={tileToNoteData(message)}
                    variant="world"
                    active={activeNoteId === message.id}
                    onActivate={() => setActiveNoteId(message.id)}
                    actions={[
                      // "Bu düşünceyi sakla" (save/preserve) intentionally not
                      // offered here — the free/normal note-card action menu
                      // is Paylaş + Bildir only. The memory feature itself
                      // (/memory/[messageId], commercial Digital Frame flow,
                      // admin access-code tooling) is untouched; this only
                      // removes its one entry point from the normal card UI.
                      { href: `/share/${message.id}`, label: dictionary.share.shareAction, icon: "share" },
                      { onClick: () => setReportingMessageId(message.id), label: dictionary.report.actionLabel, icon: "report" },
                    ]}
                    like={{
                      count,
                      liked,
                      onLike: () => handleLike(message.id, count),
                      label: dictionary.like.action,
                      likedLabel: dictionary.like.liked,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {showEmptyHint && (
        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-pill bg-surface/80 px-4 py-1.5 text-xs text-ink-soft opacity-80 backdrop-blur">
          {dictionary.boardPage.emptyRegion}
        </p>
      )}
      {anyTileError && (
        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-pill bg-surface/80 px-4 py-1.5 text-xs text-ink-soft opacity-80 backdrop-blur">
          {dictionary.boardPage.loadError}
        </p>
      )}
      {/*
       * EPIC — Duvar İçi Filtreleme: the board itself is now the "search
       * result" — these are its only feedback for a filter that's still
       * loading, failed, or genuinely matched nothing anywhere on the
       * board (not just outside the current viewport, which needs a pan,
       * not an error message — see `matchedIds.size === 0`, computed from
       * the *full* search result, never from what happens to be on
       * screen). Same quiet top-6 pill pattern as the two hints above;
       * mutually exclusive with them in practice since `showEmptyHint`'s
       * own effect is gated off while a filter is active (see above).
       */}
      {filter?.status === "loading" && (
        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-pill bg-surface/80 px-4 py-1.5 text-xs text-ink-soft opacity-80 backdrop-blur">
          {dictionary.boardDiscovery.loading}
        </p>
      )}
      {filter?.status === "error" && (
        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-pill bg-surface/80 px-4 py-1.5 text-xs text-red-600 opacity-80 backdrop-blur">
          {dictionary.boardDiscovery.error}
        </p>
      )}
      {filter?.status === "ready" && filter.matchedIds?.size === 0 && (
        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-pill bg-surface/80 px-4 py-1.5 text-xs text-ink-soft opacity-80 backdrop-blur">
          {dictionary.boardDiscovery.noResults}
        </p>
      )}
      {/* EPIC 026: mobile-only (sm:hidden) — desktop already has the visible
          BoardControls pan/zoom buttons plus an obvious mouse-drag
          affordance; a touch-only visitor has neither, and reported this
          drag-to-pan canvas as "no posts visible, can't scroll" without it. */}
      {showMobileHint && (
        // top-16, not top-6 like the two hints above: avoids stacking on top
        // of showEmptyHint/anyTileError (both anchored at top-6) if this is
        // also a first-time visit to an empty region. Never bottom-anchored
        // — BoardControls' D-pad already owns that band.
        <p className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-pill bg-surface/80 px-4 py-1.5 text-xs text-ink-soft opacity-80 backdrop-blur sm:hidden">
          {dictionary.boardPage.mobileGestureHint}
        </p>
      )}

      <BoardControls
        onPan={handlePanButton}
        onZoomIn={() => handleZoomButton(BUTTON_ZOOM_STEP)}
        onZoomOut={() => handleZoomButton(-BUTTON_ZOOM_STEP)}
        onReturnToCenter={handleReturnToCenter}
      />

      <ReportDialog
        open={reportingMessageId !== null}
        messageId={reportingMessageId}
        onClose={() => setReportingMessageId(null)}
      />
    </div>
  );
}
