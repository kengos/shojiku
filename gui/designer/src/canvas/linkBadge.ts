// Where the canvas marks an item that carries a hyperlink, derived from the
// box index alone. Pure: the overlay renders what this returns and decides
// nothing.
//
// The engine says WHETHER (`PlacedBox.linked`); this file says WHERE. The
// anchor is the item's INK, not its border box, because a text item's box is
// wider than its glyphs whenever `w` is a percentage — which is the normal
// case — so a corner badge would float in empty margin and stop reading as
// that item's mark. Every number it needs is already in the box index:
// `text.lines` for a horizontal item, `text.columns` for a vertical one, the
// border box for everything else (an image's ink IS its box).
//
// What it deliberately does NOT do is point at the linked WORD. `linked` is a
// per-item flag, so a rich block whose second span carries the link still gets
// one badge at the block's top-right. Saying more than that would need the
// annotation rects, which live on the layout tree rather than in this sidecar.

import type { PlacedBox } from '../engine/types';

/** Diameter of the badge disc in overlay px. A CONSTANT, like `HANDLE_PX` and
 * `ORIGIN_MARKER_PX`: chrome does not grow with the render scale (it rides the
 * canvas zoom's CSS transform along with everything else). */
export const LINK_BADGE_PX = 13;

/** Clear space between the last glyph and the disc's near edge, overlay px. */
const GAP_PX = 4;

/** One badge to paint: the box it belongs to, and its disc centre in overlay
 * px. `path` is the React key's basis and the reason a `repeat`'s two
 * placements produce two badges. */
export interface LinkBadge {
  readonly path: string;
  readonly cx: number;
  readonly cy: number;
}

/** The ink's right edge and the badge's vertical centre, in PT. Null when the
 * box carries a coordinate no SVG can take — the canvas-wide posture is that
 * hostile geometry degrades to nothing drawn, and an inspect response is the
 * one input here that is not ours. */
function inkAnchor(box: PlacedBox): { readonly right: number; readonly mid: number } | null {
  const metrics = box.text;
  if (metrics !== undefined && 'lines' in metrics && metrics.lines.length > 0) {
    const first = metrics.lines[0];
    let right = Number.NEGATIVE_INFINITY;
    for (const line of metrics.lines) {
      right = Math.max(right, line.x + line.width);
    }
    return finite({ right, mid: (first.emTop + first.emBottom) / 2 });
  }
  if (metrics !== undefined && 'columns' in metrics && metrics.columns.length > 0) {
    // Vertical: the ink's right edge is the rightmost column (`vertical-rl`
    // lays them right to left, so that is the FIRST one), and the badge sits
    // beside where the text starts rather than halfway down a long column.
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    for (const column of metrics.columns) {
      right = Math.max(right, column.emRight);
      top = Math.min(top, column.y);
    }
    return finite({ right, mid: top });
  }
  // No glyph metrics: an image, whose ink is its draw box, and anything else
  // the engine may stamp later.
  return finite({ right: box.border.x + box.border.w, mid: box.border.y });
}

function finite<T extends Record<string, number>>(value: T): T | null {
  for (const n of Object.values(value)) {
    if (!Number.isFinite(n)) {
      return null;
    }
  }
  return value;
}

/** One badge per linked placement, in the order the boxes arrive. A box the
 * engine did not stamp — including every box from an engine older than the
 * flag, where the field reads `undefined` — contributes nothing. */
export function linkBadges(boxes: readonly PlacedBox[], scale: number): readonly LinkBadge[] {
  if (!Number.isFinite(scale)) {
    return [];
  }
  const out: LinkBadge[] = [];
  for (const box of boxes) {
    if (box.linked !== true) {
      continue;
    }
    const anchor = inkAnchor(box);
    if (anchor === null) {
      continue;
    }
    out.push({
      path: box.path,
      cx: anchor.right * scale + GAP_PX + LINK_BADGE_PX / 2,
      cy: anchor.mid * scale,
    });
  }
  return out;
}
