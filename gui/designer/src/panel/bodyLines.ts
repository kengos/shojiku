// A `line` in the body switch. A line has no box: its `from`/`to` endpoints ARE
// its position, and they mean different things in the two bodies — in a flow
// they are relative to where the flow has reached (the line sits in the stack
// like any item), in a fixed-position body relative to the margin box. So the
// switch rebases them instead of pinning a box:
//   → fixed: shift both endpoints by where the preview drew the line (its
//     placed box is the endpoints' bounding box) minus where they say it is;
//   → flow: the line stacks at its top endpoint, so both endpoints move up by
//     that `y` (the line keeps its own shape and `x`).
// An ANCHORED endpoint (`{ item, … }`) makes the whole line absolutely placed in
// both bodies, so an anchored line is left alone. Endpoints the panel cannot
// read as lengths (a `%`, an em) cannot be rebased — the caller counts them.

import type { Op } from '@shojiku/designer-core';
import { readLength } from '../canvas/lengths';
import type { PlacedBox } from '../engine/types';

type Ends = { readonly fx: number; readonly fy: number; readonly tx: number; readonly ty: number };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Either endpoint is anchored to another item. */
export function lineAnchored(line: Record<string, unknown>): boolean {
  return record(line.from)?.item !== undefined || record(line.to)?.item !== undefined;
}

/** Both endpoints in pt, or `null` when one is not a readable length (a `%`
 * or an em has no single pt value here). */
function lineEnds(line: Record<string, unknown>): Ends | null {
  const pt = (end: unknown, axis: 'x' | 'y') => {
    const length = readLength(record(end)?.[axis] ?? 0);
    return length === null ? null : length.pt;
  };
  const [fx, fy, tx, ty] = [
    pt(line.from, 'x'),
    pt(line.from, 'y'),
    pt(line.to, 'x'),
    pt(line.to, 'y'),
  ];
  return fx === null || fy === null || tx === null || ty === null ? null : { fx, fy, tx, ty };
}

function endOps(path: string, ends: Ends): Op[] {
  return [
    { op: 'setScalar', path, keys: ['from', 'x'], value: round(ends.fx) },
    { op: 'setScalar', path, keys: ['from', 'y'], value: round(ends.fy) },
    { op: 'setScalar', path, keys: ['to', 'x'], value: round(ends.tx) },
    { op: 'setScalar', path, keys: ['to', 'y'], value: round(ends.ty) },
  ];
}

/** The fixed-position endpoints of a flowing line the preview drew at `box`
 * (page coordinates; `top`/`left` the margin origin), or `null` when its
 * endpoints cannot be read. */
export function linePinOps(
  line: Record<string, unknown>,
  path: string,
  box: PlacedBox,
  top: number,
  left: number,
): Op[] | null {
  const ends = lineEnds(line);
  if (ends === null) {
    return null;
  }
  const dx = box.border.x - left - Math.min(ends.fx, ends.tx);
  const dy = box.border.y - top - Math.min(ends.fy, ends.ty);
  return endOps(path, { fx: ends.fx + dx, fy: ends.fy + dy, tx: ends.tx + dx, ty: ends.ty + dy });
}

/** Where an unanchored line sits in a fixed-position body (its top endpoint),
 * or `null` for an anchored or unreadable one. */
export function lineTop(line: Record<string, unknown>): number | null {
  const ends = lineAnchored(line) ? null : lineEnds(line);
  return ends === null ? null : Math.min(ends.fy, ends.ty);
}

/** The flowing endpoints of a placed line: both moved up by its top, so the
 * stack places it where it was. Nothing to do when it already starts at 0. */
export function lineFlowOps(line: Record<string, unknown>, path: string): Op[] {
  const top = lineTop(line);
  if (top === null || top === 0) {
    return [];
  }
  const ends = lineEnds(line) as Ends;
  return endOps(path, { ...ends, fy: ends.fy - top, ty: ends.ty - top });
}
