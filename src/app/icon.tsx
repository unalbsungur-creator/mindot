import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const NAVY = "#0d1b2a";
const ORANGE = "#ff6a00";
const WHITE = "#fffdf9";

// Same 5x7 dot-matrix D as BrandMark, rendered with plain divs for Satori.
const DOTS: { x: number; y: number; color: string; big?: boolean }[] = [
  { x: 0, y: 0, color: ORANGE }, { x: 1, y: 0, color: WHITE }, { x: 2, y: 0, color: WHITE },
  { x: 0, y: 1, color: ORANGE }, { x: 3, y: 1, color: WHITE },
  { x: 0, y: 2, color: ORANGE }, { x: 4, y: 2, color: WHITE },
  { x: 0, y: 3, color: ORANGE }, { x: 4, y: 3, color: ORANGE, big: true },
  { x: 0, y: 4, color: ORANGE }, { x: 4, y: 4, color: WHITE },
  { x: 0, y: 5, color: ORANGE }, { x: 3, y: 5, color: WHITE },
  { x: 0, y: 6, color: ORANGE }, { x: 1, y: 6, color: WHITE }, { x: 2, y: 6, color: WHITE },
];

const CELL = 4.2;
const DOT = 3.2;
const DOT_BIG = 4.2;

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 6,
          background: NAVY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", width: 4 * CELL, height: 6 * CELL, display: "flex" }}>
          {DOTS.map((dot) => {
            const d = dot.big ? DOT_BIG : DOT;
            return (
              <div
                key={`${dot.x}-${dot.y}`}
                style={{
                  position: "absolute",
                  left: dot.x * CELL - d / 2,
                  top: dot.y * CELL - d / 2,
                  width: d,
                  height: d,
                  borderRadius: "50%",
                  background: dot.color,
                }}
              />
            );
          })}
        </div>
      </div>
    ),
    { ...size }
  );
}
