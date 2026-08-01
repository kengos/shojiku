// The overlay's STATE shapes: the ones that exist because of what the editor
// and the selection ARE, not because a gesture is in flight — the editor grid
// (painted whenever snapping is on) and the multi-selection's union frame.
// Their transient counterparts (ghost, guides, drop indicator, insert cells,
// rubber band), all fed by the live drag machines, are `OverlayGestureShapes`.
//
// Like every overlay decoration these are `pointer-events: none` and carry NO
// ARIA at all — an `aria-hidden` or `role="presentation"` on an SVG shape trips
// the a11y lint, and there is nothing here for a screen reader to announce
// beyond what the panel and the box rects already name. Inline paint is the
// no-stylesheet fallback; the stylesheet themes via the classNames.
//
// Each piece takes its geometry already resolved and NON-null: the caller's
// JSX decides whether a shape exists, so none of these carries a guard.

import type { BoxRect } from '../engine/types';

/** The editor base grid, painted when snapping is on — snapping to an
 * invisible grid reads as arbitrary pull. */
export function OverlayGrid({
  grid,
  scale,
  width,
  height,
  patternId,
}: {
  readonly grid: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly patternId: string;
}) {
  const step = grid * scale;
  return (
    <>
      <defs>
        <pattern id={patternId} width={step} height={step} patternUnits="userSpaceOnUse">
          <path
            className="sj-grid-line"
            d={`M ${step} 0 H 0 V ${step}`}
            fill="none"
            stroke="#1f1a17"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect
        className="sj-grid"
        x={0}
        y={0}
        width={width}
        height={height}
        fill={`url(#${patternId})`}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}

/** The multi-selection's union frame (dashed). */
export function GroupFrame({ rect }: { readonly rect: BoxRect }) {
  return (
    <rect
      className="sj-group-bounds"
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill="none"
      stroke="#c2402a"
      strokeWidth={1}
      strokeOpacity={0.8}
      strokeDasharray="4 3"
      style={{ pointerEvents: 'none' }}
    />
  );
}
