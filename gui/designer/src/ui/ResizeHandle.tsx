// A vertical drag handle that resizes the pane to its left — the WAI-ARIA
// window-splitter pattern: `role="separator"` + `aria-orientation="vertical"`,
// keyboard-operable (←/→ nudge by `step`) and pointer-draggable. Semantics-free:
// it reports a requested width via `onResize` (live) and `onCommit` (drag end /
// key press); the caller owns the state + persistence. Pointer capture is
// guarded for jsdom (which implements none), matching `useDrag`.

import { useRef } from 'react';

export interface ResizeHandleProps {
  /** The current pane width (px) — the keyboard nudge base + `aria-valuenow`. */
  readonly width: number;
  /** Clamp bounds (px), also `aria-valuemin`/`aria-valuemax`. */
  readonly min: number;
  readonly max: number;
  /** Live width during a drag / after a key nudge (the caller re-renders). */
  readonly onResize: (width: number) => void;
  /** The settled width to persist (pointer-up, or each key nudge). */
  readonly onCommit: (width: number) => void;
  /** Accessible name (the caller's i18n string). */
  readonly label: string;
  /** Keyboard nudge amount (px); defaults to a coarse 16px step. */
  readonly step?: number;
  /** Layout/position utilities appended to the intrinsic look (the caller
   * places the strip — e.g. absolute on a pane's edge). */
  readonly className?: string;
}

const BASE =
  'sj-resize-handle flex touch-none cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-accent focus-visible:bg-accent';

/** A decorative centered grip (three dots) that makes the otherwise-invisible
 * drag strip discoverable — users kept missing that the pane resizes. Purely
 * visual: `pointer-events-none` so drags pass through to the separator, and
 * `aria-hidden` so it adds nothing for a screen reader (the separator carries
 * the accessible name + valuenow). */
function Grip() {
  return (
    <span aria-hidden="true" className="pointer-events-none flex flex-col gap-0.5">
      <span className="h-0.5 w-0.5 rounded-full bg-muted" />
      <span className="h-0.5 w-0.5 rounded-full bg-muted" />
      <span className="h-0.5 w-0.5 rounded-full bg-muted" />
    </span>
  );
}

interface DragSession {
  readonly startX: number;
  readonly startWidth: number;
  width: number;
}

function isFinitePointer(event: React.PointerEvent<Element>): boolean {
  return Number.isFinite(event.clientX);
}

export function ResizeHandle({
  width,
  min,
  max,
  onResize,
  onCommit,
  label,
  step = 16,
  className,
}: ResizeHandleProps) {
  const session = useRef<DragSession | null>(null);
  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || !isFinitePointer(event)) {
      return;
    }
    event.preventDefault();
    // Guarded: jsdom implements no pointer capture; a real browser keeps the
    // move/up stream on this element while the pointer travels over the canvas.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    session.current = { startX: event.clientX, startWidth: width, width };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (active === null || !isFinitePointer(event)) {
      return;
    }
    const next = clamp(active.startWidth + (event.clientX - active.startX));
    active.width = next;
    onResize(next);
  };

  const onPointerUp = () => {
    const active = session.current;
    if (active === null) {
      return;
    }
    session.current = null;
    onCommit(active.width);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (event.key === 'ArrowLeft') {
      delta = -step;
    } else if (event.key === 'ArrowRight') {
      delta = step;
    } else {
      return;
    }
    event.preventDefault();
    const next = clamp(width + delta);
    onResize(next);
    onCommit(next);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: an interactive window-splitter (focusable, keyboard-nudgeable, aria-valuenow) — <hr> is a void, non-focusable element and cannot represent it.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={[BASE, className].filter(Boolean).join(' ')}
    >
      <Grip />
    </div>
  );
}
