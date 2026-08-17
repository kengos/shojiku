// The overlay's STATE shapes: the ones that exist because of what the editor
// and the selection ARE, not because a gesture is in flight — the editor grid
// (painted whenever snapping is on) and the multi-selection's union frame.
// Their transient counterparts (ghost, guides, drop indicator, insert cells,
// rubber band), all fed by the live drag machines, are `OverlayGestureShapes`.
//
// Like every overlay decoration these are `pointer-events: none` and carry NO
// ARIA at all — `aria-hidden` or `role="presentation"` on an SVG shape trips the
// a11y lint (Biome's `noAriaHiddenOnFocusable` treats `<g>` and `<text>` alike,
// tabindex or not), so there is no way to mark one decorative without a
// suppression. For the pure GEOMETRY shapes that costs nothing: a bare `<rect>`
// announces nothing to begin with. `MarginGuideShape`'s `0,0` label is the ONE
// piece of readable text here and IS announced — accepted rather than
// suppressed, because it is two characters and the concept behind it is
// reachable in prose from the placement tab's `?`. Inline paint is the
// no-stylesheet fallback; the stylesheet themes via the classNames.
//
// Each piece takes its geometry already resolved and NON-null: the caller's
// JSX decides whether a shape exists, so none of these carries a guard.

import type { BoxRect } from '../engine/types';
import { type MarginGuide, ORIGIN_MARKER_PX } from './marginGuide';

/** The page MARGIN BOX — the rectangle `x: 0` / `y: 0` are measured from.
 *
 * Dashed on purpose: nothing the ENGINE draws is dashed, so the rectangle
 * cannot be read as document ink however long you look at it. Dashing is not on
 * its own a distinguishing signal — the canvas carries nine other dashed shapes
 * (focus ring, dragging box, ghost box, multi-selection group frame, drag ghost,
 * smart guides, marquee, container outline, container slot guides). What
 * separates this one is that all nine are ACCENT-coloured and each is driven by
 * a focus, selection or drag, while this is the only ink-toned one and the only
 * one that is always there.
 *
 * Both strokes are FIXED values rather than `--sj-text` / `--sj-accent`: this
 * shape is drawn on the engine-rendered paper, which is pixels rather than
 * chrome and so stays white in both colour schemes. A text-toned stroke would
 * flip to near-white in dark chrome and vanish against the page. */
export function MarginGuideShape({ guide }: { readonly guide: MarginGuide }) {
  const { rect, origin } = guide;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        className="sj-margin-guide"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="none"
        stroke="#1f1a17"
        strokeOpacity={0.38}
        strokeWidth={1}
        strokeDasharray="4 3"
      />
      {origin ? (
        <>
          <path
            className="sj-margin-origin"
            d={`M ${rect.x} ${rect.y - ORIGIN_MARKER_PX} V ${rect.y} H ${rect.x + ORIGIN_MARKER_PX}`}
            fill="none"
            stroke="#c2402a"
            strokeOpacity={0.88}
            strokeWidth={1.2}
          />
          {/* A chrome CONSTANT, never document-derived — this whole shape's
              input is four numbers, so nothing authored can reach the page.
              It is also the only text in this file a screen reader reads out;
              see the header note on why that is accepted rather than hidden. */}
          <text
            className="sj-margin-origin-text"
            x={rect.x + 3}
            y={rect.y - 3}
            fontSize={8}
            fill="#c2402a"
            fillOpacity={0.92}
          >
            0,0
          </text>
        </>
      ) : null}
    </g>
  );
}

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
