"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { clampZoom, DEFAULT_ZOOM, type Camera } from "../lib/worldGeometry";

type CameraAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "set"; camera: Camera }
  | { type: "zoomTo"; camera: Camera };

function reducer(state: Camera, action: CameraAction): Camera {
  switch (action.type) {
    case "pan":
      return { ...state, x: state.x + action.dx, y: state.y + action.dy };
    case "set":
    case "zoomTo":
      return action.camera;
    default:
      return state;
  }
}

/**
 * EPIC: Duvar Yerleşimi — a fresh `/board` visit (no `?x=&y=&z=` yet) used
 * to default to world (0, 0), the *corner* of tile (0,0), not its center.
 * Since real approved messages are spread across that whole tile
 * (confirmed by querying actual coordinates before this fix — positions
 * ranging roughly 0.04–0.89 on both axes, a genuinely even spread, not a
 * bottom-right cluster), centering the camera on the tile's corner meant
 * only the bottom-right quadrant of the initial viewport ever showed real
 * content — exactly the reported symptom. This was a camera bug, not a
 * data distribution problem, so the fix is here, not in message
 * coordinates: fall back to `centerPoint` (the same point "return to
 * center" already targets) instead of the bare origin.
 */
/**
 * `Number(null)` is `0`, and `0` is finite — so reading a genuinely
 * *absent* query param the same way as a present one silently produced a
 * valid-looking `0` instead of falling through to the default. Harmless
 * with the old hardcoded-0 fallback (they coincided), but it broke this
 * EPIC's fix (a non-zero `centerPoint` fallback) — confirmed by real
 * testing: the URL stayed `?x=0&y=0` on a bare `/board` visit even after
 * this function's default branch was changed. Fixed by checking presence
 * first, not just parsing and finiteness.
 */
function numericParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function initialCameraFromUrl(centerPoint: { x: number; y: number }): Camera {
  if (typeof window === "undefined") return { ...centerPoint, zoom: DEFAULT_ZOOM };
  const params = new URLSearchParams(window.location.search);
  const x = numericParam(params, "x");
  const y = numericParam(params, "y");
  const z = numericParam(params, "z");
  return {
    x: x ?? centerPoint.x,
    y: y ?? centerPoint.y,
    zoom: z !== null && z > 0 ? clampZoom(z) : DEFAULT_ZOOM,
  };
}

const URL_SYNC_DEBOUNCE_MS = 800;

/**
 * The board's dedicated position/zoom state layer — a plain reducer, no
 * external state library. Reads an initial position from `?x=&y=&z=` on
 * mount (shareable-URL foundation); writes back to the URL via a debounced
 * `history.replaceState` so continuous dragging never spams navigation
 * history or fires on every frame.
 *
 * `centerPoint` is where `resetToCenter()` goes — resolved by the caller
 * (see app/board/page.tsx's `resolveBoardCenterPoint`), not computed here:
 * this hook has no DB/server access, so it can't itself know whether the
 * board's reference message is still live. Dispatched as a plain "set"
 * action (reusing the existing action type) rather than a dedicated
 * "reset" case, so this file doesn't need to know anything about what the
 * point means either.
 */
export function useBoardCamera(centerPoint: { x: number; y: number }) {
  const [camera, dispatch] = useReducer(reducer, centerPoint, initialCameraFromUrl);
  const urlSyncTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (urlSyncTimeout.current) clearTimeout(urlSyncTimeout.current);
    urlSyncTimeout.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("x", String(Math.round(camera.x)));
      params.set("y", String(Math.round(camera.y)));
      params.set("z", camera.zoom.toFixed(2));
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }, URL_SYNC_DEBOUNCE_MS);

    return () => {
      if (urlSyncTimeout.current) clearTimeout(urlSyncTimeout.current);
    };
  }, [camera]);

  const pan = useCallback((dx: number, dy: number) => dispatch({ type: "pan", dx, dy }), []);
  const setCamera = useCallback((next: Camera) => dispatch({ type: "set", camera: next }), []);
  const zoomTo = useCallback((next: Camera) => dispatch({ type: "zoomTo", camera: next }), []);
  const resetToCenter = useCallback(
    () => dispatch({ type: "set", camera: { x: centerPoint.x, y: centerPoint.y, zoom: DEFAULT_ZOOM } }),
    [centerPoint]
  );

  return { camera, pan, setCamera, zoomTo, resetToCenter };
}
