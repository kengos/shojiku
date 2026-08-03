// The coach mark: a spotlight ring around the control a step points at, and a
// bubble carrying the step's sentence. Purely presentational — it is handed a
// rectangle and a string, so its positioning is testable without a layout
// engine, and it never decides when a step is done.
//
// The overlay does NOT capture pointer events: the user has to be able to
// operate the very control being pointed at. Only the bubble itself is
// interactive.

import { Button } from '../ui/Button';
import type { AnchorRect } from './anchors';

export interface CoachOverlayProps {
  /** The sentence for the current step. */
  readonly copy: string;
  /** Chapter heading, shown above the sentence for orientation. */
  readonly title: string;
  /** Progress within the course, e.g. "3 / 45". */
  readonly progressLabel: string;
  /** Where the pointed-at control is, or null when it is not on screen — the
   * bubble then centers itself instead of pointing at nothing. */
  readonly rect: AnchorRect | null;
  /** Present on explanation-only steps: the button that advances. */
  readonly onNext?: () => void;
  readonly nextLabel: string;
  readonly exitLabel: string;
  readonly onExit: () => void;
}

/** Padding around the spotlighted control, in px. */
const HALO = 6;

/** Bubble width; also the clamp width when it would run off the viewport. */
const BUBBLE_WIDTH = 320;

/** Room the bubble is assumed to need below its top edge. Its real height is
 * whatever the sentence takes, so this is a floor, not a measurement — enough
 * that a bubble under a tall anchor (a whole dialog, the settings page) stays
 * on screen instead of sliding off the bottom. */
const BUBBLE_ROOM = 180;

/** Place the bubble under the anchor (or centered when there is none). Kept
 * separate and pure so the placement rules are unit-testable. */
export function bubblePosition(rect: AnchorRect | null): { left: number; top: number } {
  if (rect === null) {
    return { left: Math.max(16, (window.innerWidth - BUBBLE_WIDTH) / 2), top: 80 };
  }
  const left = Math.min(
    Math.max(16, rect.left),
    Math.max(16, window.innerWidth - BUBBLE_WIDTH - 16),
  );
  const under = rect.top + rect.height + HALO * 2;
  const top = Math.max(16, Math.min(under, window.innerHeight - BUBBLE_ROOM));
  return { left, top };
}

export function CoachOverlay({
  copy,
  title,
  progressLabel,
  rect,
  onNext,
  nextLabel,
  exitLabel,
  onExit,
}: CoachOverlayProps) {
  const bubble = bubblePosition(rect);
  return (
    <div className="pointer-events-none fixed inset-0 z-40" data-testid="coach-overlay">
      {rect === null ? null : (
        <div
          data-testid="coach-spotlight"
          className="absolute rounded-md border-2 border-accent"
          style={{
            left: rect.left - HALO,
            top: rect.top - HALO,
            width: rect.width + HALO * 2,
            height: rect.height + HALO * 2,
          }}
        />
      )}
      <div
        role="status"
        data-testid="coach-bubble"
        className="pointer-events-auto absolute rounded-md border border-border bg-surface p-3 text-text shadow-2xl"
        style={{ left: bubble.left, top: bubble.top, width: BUBBLE_WIDTH }}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted">{progressLabel}</span>
        </div>
        <p className="m-0 text-sm leading-relaxed">{copy}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onExit}>
            {exitLabel}
          </Button>
          {onNext === undefined ? null : <Button onClick={onNext}>{nextLabel}</Button>}
        </div>
      </div>
    </div>
  );
}
