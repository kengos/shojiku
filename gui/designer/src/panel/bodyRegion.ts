// A flowing body's region (`sections.body.box`) as the 本文 form edits it. Unlike
// an item's box, the region is all-or-nothing on the wire: the engine reads it
// as a full `BoxSpec` (x, y, w and h all required — `missing field` otherwise),
// and an absent region means the whole margin box. So a one-axis edit is
// completed into the full region with the other axes at the values that mean
// "the whole margin box" (0, 0, 100%, 100%), and an edit that puts every axis
// back at those values removes the region instead — the fields go empty again,
// which is what the hint under them promises.
//
// The switch back from fixed positions builds a region too (`topRegion`): the
// topmost item's `y` as its top, so that item stays where it was.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { documentContentHeightPt } from '../insert/bandGeometry';
import { readItem } from './placementModel';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

type Axis = 'x' | 'y' | 'w' | 'h';
const AXES: readonly Axis[] = ['x', 'y', 'w', 'h'];

/** Each axis's value when the region is the whole margin box. */
export const REGION_DEFAULTS: Readonly<Record<Axis, number | string>> = {
  x: 0,
  y: 0,
  w: '100%',
  h: '100%',
};

/** The batch that applies one axis edit (`op`: a `setScalar` or `removeKey` on
 * `['box', axis]`, as the box fields build it) to the body at `path` as a whole
 * region, or `null` when there is nothing to do. */
export function regionOps(read: ReadFn, path: string, op: Op | null): Op[] | null {
  if (op === null || !('keys' in op) || op.keys[0] !== 'box') {
    return null;
  }
  const axis = op.keys[1] as Axis;
  const raw = readItem(read, path)?.box;
  const current = typeof raw === 'object' && raw !== null && !Array.isArray(raw);
  const next: Record<string, unknown> = {
    ...REGION_DEFAULTS,
    ...(current ? (raw as Record<string, unknown>) : {}),
  };
  next[axis] = op.op === 'setScalar' ? op.value : REGION_DEFAULTS[axis];
  if (AXES.every((key) => next[key] === REGION_DEFAULTS[key])) {
    return current ? [{ op: 'removeKey', path, keys: ['box'] }] : null;
  }
  const region = Object.fromEntries(AXES.map((key) => [key, next[key]]));
  return [
    { op: 'putValue', path, keys: ['box'], value: region as Record<string, number | string> },
  ];
}

/** The region that keeps the topmost child where it was (`ys`: where each
 * placed child sits, 0 for one with no `y`): the margin box from that `y`
 * down to the footer band (the engine does not keep a flow out of the bands
 * by itself). `null` when a child sits at the margin's top, or the document
 * does not state its page height exactly. */
export function topRegion(
  read: ReadFn,
  ys: readonly number[],
): Record<string, number | string> | null {
  const top = Math.min(...ys);
  const footer = record(read('sections.footer'))?.height;
  const bottom = typeof footer === 'number' && footer > 0 ? footer : 0;
  const height = (documentContentHeightPt(read) ?? Number.NaN) - bottom - top;
  if (!(top > 0 && height > 0)) {
    return null;
  }
  return { x: 0, y: top, w: '100%', h: Math.round(height * 100) / 100 };
}
