// Where a canvas cross-parent drop LANDS: which owner the pointer is over,
// and the slot inside it. The owner rule mirrors `palette/cellTarget`'s —
// innermost hit wins, a throwing read reads as "not a target" — and the slot
// math is the shipped reorder one (`dropPlan`), never a second implementation.
// What the landing then COMMITS is `reparent`.
//
// The one piece the engine does not hand us is where a header/footer BAND
// sits: `inspect` reports item boxes and the page margins, and a band has no
// box of its own. What the DOCUMENT states is `sections.<band>.height`, which
// is informational to layout but is the extent every bundled template lays
// its `body.box` out around — so it is the band's region here too. A band
// that declares no height is simply not a canvas drop target; the layer tree
// still reaches it.

import type { ReadFn } from '@shojiku/designer-core';
import type { BoxRect, PlacedBox } from '../engine/types';
import { type Receiver, receiverFor, siblingRects } from './dnd';
import { dropSlotFor, type IndicatorLine, indicatorLine, slotToDocIndex } from './dropPlan';
import { record } from './manipulate';
import type { PageMargin } from './marginGuide';
import { pathDepth } from './overlayGeometry';
import type { DropPoint, ReparentTarget } from './reparent';

/** The page the drop happens on, in PT — the unit the margins and the band
 * heights are authored in. (The overlay itself measures in px; the caller
 * divides by the render scale.) */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function contains(rect: BoxRect, point: DropPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/** The page region a band declares: the top `height` of the margin box for a
 * header, the bottom `height` for a footer (the shape `insert/bandPlacement`
 * already places a fresh band item by). `null` when the band declares none —
 * absent, not a positive finite number, or taller than the margin box. */
export function bandRegion(
  read: ReadFn,
  band: 'header' | 'footer',
  page: PageSize,
  margin: PageMargin,
): BoxRect | null {
  let height: unknown;
  try {
    height = record(read(`sections.${band}`))?.height;
  } catch {
    return null;
  }
  const boxWidth = page.width - margin[3] - margin[1];
  const boxHeight = page.height - margin[0] - margin[2];
  if (!positiveFinite(boxWidth) || !positiveFinite(boxHeight)) {
    return null;
  }
  // A band taller than the margin box states nothing useful about where it
  // sits, so it declares no region rather than one covering the whole page.
  if (typeof height !== 'number' || !(height > 0) || height > boxHeight) {
    return null;
  }
  const y = band === 'header' ? margin[0] : margin[0] + boxHeight - height;
  return { x: margin[3], y, w: boxWidth, h: height };
}

/** The owner under the pointer: a band whose declared region holds it, else
 * the innermost laid-out box that can receive items, else the body section
 * (the page's own owner, which has no box of its own). */
export function receiverUnder(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  point: DropPoint,
  page: PageSize,
  margin: PageMargin | null,
): Receiver | null {
  if (margin !== null) {
    for (const band of ['header', 'footer'] as const) {
      const region = bandRegion(read, band, page, margin);
      if (region !== null && contains(region, point)) {
        return receiverFor(read, `sections.${band}`);
      }
    }
  }
  let best: Receiver | null = null;
  let bestDepth = -1;
  for (const box of pageBoxes) {
    const depth = pathDepth(box.path);
    if (!contains(box.border, point) || depth <= bestDepth) {
      continue;
    }
    const receiver = receiverFor(read, box.path);
    if (receiver !== null) {
      best = receiver;
      bestDepth = depth;
    }
  }
  return best ?? receiverFor(read, 'sections.body');
}

/** A planned cross-parent drop: what a release would commit and what the
 * overlay paints while it hovers. `line` is the insertion indicator inside an
 * ORDER-placed receiver; a coordinate-placed one has no slot to point at, so
 * it paints its region instead. */
export interface ReparentPlan {
  readonly target: ReparentTarget;
  readonly line: IndicatorLine | null;
  readonly region: BoxRect | null;
}

/** The sequence length at `path`, 0 when missing, not a list, or unreadable. */
function seqLength(read: ReadFn, path: string): number {
  try {
    const value = read(path);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

/** Plan the drop at `point`. `null` when nothing there can receive an item,
 * or when an order-placed receiver's own geometry is ambiguous (repeat
 * fragments share a path, so a slot computed over them would lie). */
export function planReparent(
  read: ReadFn,
  pageBoxes: readonly PlacedBox[],
  point: DropPoint,
  page: PageSize,
  margin: PageMargin | null,
): ReparentPlan | null {
  const receiver = receiverUnder(read, pageBoxes, point, page, margin);
  if (receiver === null) {
    return null;
  }
  const region = ownerRegion(pageBoxes, receiver, read, page, margin);
  const { axis } = receiver.placement;
  if (axis === null) {
    return {
      target: { receiver, index: seqLength(read, receiver.items), at: point },
      line: null,
      region,
    };
  }
  const siblings = siblingRects(pageBoxes, receiver.items);
  if (siblings === null) {
    return null;
  }
  const slot = dropSlotFor(siblings, axis === 'y' ? point.y : point.x, axis);
  if (slot === null) {
    return null;
  }
  return {
    target: { receiver, index: slotToDocIndex(siblings, slot), at: point },
    line: indicatorLine(siblings, slot, axis),
    region,
  };
}

/** The rect to outline for a receiver: a band's declared region, an item
 * owner's own laid-out box, or `null` for the body section, which has no box
 * (the page itself is the affordance). */
function ownerRegion(
  pageBoxes: readonly PlacedBox[],
  receiver: Receiver,
  read: ReadFn,
  page: PageSize,
  margin: PageMargin | null,
): BoxRect | null {
  const owner = receiver.items.slice(0, -'.items'.length);
  if (margin !== null && (owner === 'sections.header' || owner === 'sections.footer')) {
    return bandRegion(read, owner === 'sections.header' ? 'header' : 'footer', page, margin);
  }
  return pageBoxes.find((box) => box.path === owner)?.border ?? null;
}
