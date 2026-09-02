"use client";

import { cn } from "@/lib/cn";
import { useLocale } from "@/i18n/LocaleProvider";

interface BoardControlsProps {
  onPan: (dx: number, dy: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReturnToCenter: () => void;
}

const PAN_STEP = 140;

function ArrowIcon({ rotation }: { rotation: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path
        d="M8 2.5v11M8 2.5 3.5 7M8 2.5 12.5 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ControlButton({
  onClick,
  label,
  className,
  children,
}: {
  onClick: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-surface/90 text-navy shadow-card backdrop-blur transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange",
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * A compact D-pad + zoom cluster — subtle exploration tools, not a
 * dashboard toolbar. Every button is a real, labeled, keyboard-focusable
 * <button>; the freeform canvas itself is the one part of this experience
 * that intentionally doesn't behave like a conventional control.
 */
export function BoardControls({ onPan, onZoomIn, onZoomOut, onReturnToCenter }: BoardControlsProps) {
  const { dictionary } = useLocale();

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex items-end justify-between px-4 sm:bottom-6 sm:px-6">
      <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1">
        <div />
        <ControlButton
          label={dictionary.boardControls.panUp}
          onClick={() => onPan(0, -PAN_STEP)}
          className="col-start-2 row-start-1"
        >
          <ArrowIcon rotation={0} />
        </ControlButton>
        <div />

        <ControlButton
          label={dictionary.boardControls.panLeft}
          onClick={() => onPan(-PAN_STEP, 0)}
          className="col-start-1 row-start-2"
        >
          <ArrowIcon rotation={-90} />
        </ControlButton>
        <ControlButton
          label={dictionary.boardControls.returnToCenter}
          onClick={onReturnToCenter}
          className="col-start-2 row-start-2 border-orange/40 bg-orange text-white hover:bg-orange-soft"
        >
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-white" />
        </ControlButton>
        <ControlButton
          label={dictionary.boardControls.panRight}
          onClick={() => onPan(PAN_STEP, 0)}
          className="col-start-3 row-start-2"
        >
          <ArrowIcon rotation={90} />
        </ControlButton>

        <div />
        <ControlButton
          label={dictionary.boardControls.panDown}
          onClick={() => onPan(0, PAN_STEP)}
          className="col-start-2 row-start-3"
        >
          <ArrowIcon rotation={180} />
        </ControlButton>
        <div />
      </div>

      <div className="pointer-events-auto flex flex-col gap-1.5">
        <ControlButton label={dictionary.boardControls.zoomIn} onClick={onZoomIn}>
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
        </ControlButton>
        <ControlButton label={dictionary.boardControls.zoomOut} onClick={onZoomOut}>
          <span aria-hidden="true" className="text-lg leading-none">
            −
          </span>
        </ControlButton>
      </div>
    </div>
  );
}
