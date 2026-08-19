// The DROP shapes: what the overlay paints to answer "where would this land,
// and at what cost". Split from `OverlayGestureShapes` because these four are
// ONE answer assembled from four layers, and because the warning chip is the
// only gesture shape that carries TEXT — a localized sentence the host
// resolves and passes in, since `BoxOverlay` takes no i18n of its own.
//
// Like every overlay decoration these are `pointer-events: none` and carry NO
// ARIA at all.

import type { BoxRect } from '../engine/types';
import type { IndicatorLine } from './dropPlan';
import { DropLine, InsertRects } from './OverlayGestureShapes';

/** The DROP indicators, assembled: the receiving owner of a cross-parent drop
 * (outlined UNDER the line, so the line stays the answer to "where exactly"),
 * the insertion line — a reorder slot or the palette drag's externally planned
 * one, at most one of which exists — the cells a palette drop would enter, and
 * the warning a drop that would DROP the item's own coordinates carries.
 *
 * Assembled here rather than in `BoxOverlay` because these four are one
 * answer to one question ("where would this land, and at what cost"), and the
 * overlay should read as a list of layers rather than of conditionals. */
export function DropIndicators({
  region,
  line,
  insertRects,
  warning,
  ghost,
  scale,
}: {
  readonly region: BoxRect | null;
  readonly line: IndicatorLine | null;
  readonly insertRects: readonly BoxRect[];
  /** The localized sentence, already resolved by the host — `undefined` when
   * this drop costs nothing. `BoxOverlay` takes no i18n of its own. */
  readonly warning: string | undefined;
  /** The dragged item's ghost, in overlay px — what the warning hangs on.
   * NOT the receiver's outline: the flow body is a receiver with no box of
   * its own, so anchoring to that would silently drop the warning for
   * exactly the drops that leave the body's own children unpositioned. */
  readonly ghost: BoxRect | null;
  readonly scale: number;
}) {
  return (
    <>
      {region === null ? null : <InsertRects rects={[region]} scale={scale} />}
      {line === null ? null : <DropLine line={line} scale={scale} />}
      <InsertRects rects={insertRects} scale={scale} />
      {ghost === null || warning === undefined ? null : <DropWarning text={warning} rect={ghost} />}
    </>
  );
}

// Warning-chip geometry in overlay px (decorative, like the container chip).
const WARN_HEIGHT_PX = 20;
const WARN_FONT_PX = 11;
const WARN_PAD_PX = 8;

/** Approximate chip width for the sentence — SVG text has no auto-sized
 * background, so this mirrors `ContainerMarkVisual`'s measure: CJK glyphs run
 * ~1em, everything else ~0.55em. */
function warnWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += ch.charCodeAt(0) >= 0x2e80 ? WARN_FONT_PX : WARN_FONT_PX * 0.55;
  }
  return Math.ceil(width) + WARN_PAD_PX * 2;
}

/** What a drop will COST, said before the release: the receiving owner takes
 * position over from the item, so its authored `x`/`y` go. Sits just above
 * the dragged item's ghost — where the pointer already is — clamped to stay
 * on the page. */
function DropWarning({ text, rect }: { readonly text: string; readonly rect: BoxRect }) {
  const width = warnWidth(text);
  const y = Math.max(0, rect.y - WARN_HEIGHT_PX - 2);
  return (
    <>
      <rect
        className="sj-drop-warning"
        x={rect.x}
        y={y}
        width={width}
        height={WARN_HEIGHT_PX}
        rx={4}
        fill="#f7ecd3"
        stroke="#e0d3ae"
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={rect.x + WARN_PAD_PX}
        y={y + WARN_HEIGHT_PX / 2 + WARN_FONT_PX * 0.36}
        fontSize={WARN_FONT_PX}
        fill="#8a6116"
        style={{ pointerEvents: 'none' }}
      >
        {text}
      </text>
    </>
  );
}
