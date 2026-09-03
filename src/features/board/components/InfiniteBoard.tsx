"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Note } from "@/features/notes/components/Note";
import type { NoteData } from "@/features/notes/types";
import { cn } from "@/lib/cn";
import { getAnonymousId } from "@/lib/anonymousId";
import { useLocale } from "@/i18n/LocaleProvider";
import { likeMessage } from "@/features/messages/like-actions";
import { ReportDialog } from "@/features/reports/components/ReportDialog";
import type { BoardTile } from "../types";
import { useBoardCamera } from "../hooks/useBoardCamera";
import { useTileCache } from "../hooks/useTileCache";
import {
  clampZoom,
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
    size: "md",
    rotation: message.rotation,
    position: { top: `${message.position.y * 100}%`, left: `${message.position.x * 100}%` },
    language: message.language,
  };
}

export function InfiniteBoard({
  initialTile,
  centerPoint,
}: {
  initialTile?: BoardTile;
  /** Where "return to center" goes — see useBoardCamera's own doc comment. */
  centerPoint: { x: number; y: number };
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

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    isGesturingRef.current = true;

    if (pointers.current.size === 1) {
      dragStart.current = { x: event.clientX, y: event.clientY, camera: liveCameraRef.current };
    } else if (pointers.current.size === 2) {
      dragStart.current = null;
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), camera: liveCameraRef.current };
    }
  }, []);

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
    if (visibleMessageCount > 0 || anyTileLoading || viewport.width === 0) return;
    const timeout = setTimeout(() => setShowEmptyHint(true), EMPTY_HINT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [visibleMessageCount, anyTileLoading, viewport.width]);

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
    >
      <div
        ref={worldRef}
        className={cn(
          "absolute left-0 top-0 origin-top-left will-change-transform",
          isResetting && "transition-transform duration-500 ease-out"
        )}
      >
        <BoardCenterMark />
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
                const liked = likedIds.has(message.id);
                const count = likeCountOverrides[message.id] ?? message.likeCount;
                return (
                  <Note
                    key={message.id}
                    note={tileToNoteData(message)}
                    variant="world"
                    actions={[
                      { href: `/memory/${message.id}`, label: dictionary.memory.preserveAction, icon: "save" },
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
