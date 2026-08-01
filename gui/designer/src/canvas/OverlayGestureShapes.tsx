// The overlay's GESTURE shapes: the ones that exist only while something is in
// flight — the pointer-following ghost, the winning alignment guides, the drop
// indicator (a reorder slot or the palette drag's externally planned line), the
// cells a palette drop would enter, and the rubber band. Every one of them is
// fed by a live drag machine (`useOverlayDrag`) or by the external palette-drag
// props; the shapes that persist with editor/selection STATE are
// `OverlayShapes`.
//
// Like every overlay decoration these are `pointer-events: none` and carry NO
// ARIA at all (see `OverlayShapes` for why), and each takes its geometry
// already resolved and NON-null — the caller's JSX decides whether a shape
// exists, so none of these carries a guard.

import type { BoxRect } from '../engine/types';
import type { IndicatorLine } from './dropPlan';
import { scaleRect } from './geometry';
import type { GuideLine } from './guides';

/** The pointer-following ghost: the dragged box's outline. */
export function GhostRect({ rect }: { readonly rect: BoxRect }) {
  return (
    <rect
      className="sj-drag-ghost"
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill="#c2402a"
      fillOpacity={0.12}
      stroke="#c2402a"
      strokeDasharray="4 3"
      style={{ pointerEvents: 'none' }}
    />
  );
}

/** The winning sibling-alignment guides (page pt, scaled here). */
export function GuideLines({
  guides,
  scale,
}: {
  readonly guides: readonly GuideLine[];
  readonly scale: number;
}) {
  return (
    <>
      {guides.map((line) => (
        <line
          key={`${line.x1}:${line.y1}:${line.x2}:${line.y2}`}
          className="sj-guide"
          x1={line.x1 * scale}
          y1={line.y1 * scale}
          x2={line.x2 * scale}
          y2={line.y2 * scale}
          stroke="#c2402a"
          strokeWidth={1}
          strokeDasharray="2 2"
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </>
  );
}

/** The insertion indicator — a reorder drop slot or the palette drag's
 * externally planned line (the two gestures are mutually exclusive, so one
 * rendering serves both). */
export function DropLine({
  line,
  scale,
}: {
  readonly line: IndicatorLine;
  readonly scale: number;
}) {
  return (
    <line
      className="sj-drop-indicator"
      x1={line.x1 * scale}
      y1={line.y1 * scale}
      x2={line.x2 * scale}
      y2={line.y2 * scale}
      stroke="#c2402a"
      strokeWidth={2}
      style={{ pointerEvents: 'none' }}
    />
  );
}

/** The palette drag's OTHER indicator: the cell fragment(s) a drop would
 * enter, outlined. A row's cell is one authored sub-template drawn many times,
 * so no single slot line can point at it — every fragment outlines instead. */
export function InsertRects({
  rects,
  scale,
}: {
  readonly rects: readonly BoxRect[];
  readonly scale: number;
}) {
  return (
    <>
      {rects.map((rect) => {
        const px = scaleRect(rect, scale);
        return (
          <rect
            className="sj-drop-cell"
            key={`${px.x}:${px.y}:${px.w}:${px.h}`}
            x={px.x}
            y={px.y}
            width={px.w}
            height={px.h}
            fill="#c2402a"
            fillOpacity={0.1}
            stroke="#c2402a"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}
    </>
  );
}

/** The active rubber-band rect (a translucent accent fill). */
export function MarqueeRect({ rect }: { readonly rect: BoxRect }) {
  return (
    <rect
      className="sj-marquee"
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill="#c2402a"
      fillOpacity={0.08}
      stroke="#c2402a"
      strokeWidth={1}
      strokeDasharray="3 2"
      style={{ pointerEvents: 'none' }}
    />
  );
}
