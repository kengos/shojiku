// What the RENDER resolved: the geometry the placement tab shows for a placed item,
// read from the last-good box index rather than the document. The other half of
// the placement pair — `placementModel.ts` classifies and authors from the
// DOCUMENT alone (so it stays correct when a render fails); everything here
// needs a render to have happened, and degrades to `null` when it has not.
//
// Coordinates are parent-content-relative for a `pinnable` child (the form the
// pin writes back) and page-origin otherwise; sizes are the resolved border box.

import type { ReadFn } from '@shojiku/designer-core';
import { formatLength, readLength } from '../canvas/lengths';
import type { BoxIndex, BoxRect, PlacedBox } from '../engine/types';
import { ownerPathOf, type Placement, readItem } from './placementModel';

/** The resolved-geometry inputs the panel threads down: the last-good inspect
 * box index, the page margins `[top,right,bottom,left]`, and whether that
 * geometry matches the CURRENT document (rendered revision === live revision).
 * Displays and seeds resolve from the boxes REGARDLESS of freshness — the
 * canvas posture (paint last-good, act on fresh): a mid-render degradation
 * would flap the field types and remount value-keyed seeds, discarding
 * in-progress entry. `fresh` gates only the PIN action (the one thing that
 * writes the values into the wire). */
export interface PlacementGeometry {
  readonly boxes: BoxIndex;
  readonly margin: readonly [number, number, number, number];
  readonly fresh: boolean;
}

/** Per-axis resolved values in the AUTHORED form (bare pt numbers), ready to
 * display and — for `pinnable` — to write as the pin coordinate. A `null` axis
 * is unresolvable (missing/hostile/non-finite geometry); the panel then
 * degrades that field to the plain editable input and disables the fixed
 * toggle. `x`/`y` are parent-content-relative for `pinnable`, page-origin for
 * `flow`/`coordinate`; `w`/`h` are the resolved border-box size everywhere. */
export interface ResolvedPlacement {
  readonly x: number | null;
  readonly y: number | null;
  readonly w: number | null;
  readonly h: number | null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The first `PlacedBox` at `path` across all pages (a placeable item appears
 * once per page it is on; `pinnable`/`flow`/`coordinate` items appear once).
 * Lookup is an array `.find` on the path string — never a Record index, so a
 * hostile path (`__proto__`) can only miss, never walk the prototype. */
function findBox(boxes: BoxIndex, path: string): PlacedBox | undefined {
  for (const page of boxes.pages) {
    const hit = page.find((b) => b.path === path);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

/** A pt value rounded to the authored (unitless) form, or `null` if non-finite
 * — the same rounding the canvas DnD commit uses (`formatLength(_, null)`
 * returns a number). */
function fmt(pt: number): number | null {
  const value = formatLength(pt, null);
  return typeof value === 'number' ? value : null;
}

/** A child `box.margin`'s left/top pt offsets, which the engine ADDS to the
 * authored x/y when placing the item — so the pin math must subtract them.
 * Absent = 0. `auto` = 0 too: auto margins resolve to 0 once the item leaves
 * flex placement (the engine rule), so a pinned child's margin contributes
 * nothing. `%`/garbage margins are not pt-safe → `null` disables the toggle. */
export function childMarginInset(
  read: ReadFn,
  path: string,
): { readonly left: number; readonly top: number } | null {
  const box = record(readItem(read, path)?.box);
  const margin = box?.margin;
  if (margin === undefined || margin === 'auto') {
    return { left: 0, top: 0 };
  }
  const uniform = readLength(margin);
  if (uniform !== null) {
    return { left: uniform.pt, top: uniform.pt };
  }
  const sides = record(margin);
  if (sides === undefined) {
    return null;
  }
  const left = sideInset(sides.left);
  const top = sideInset(sides.top);
  return left === null || top === null ? null : { left, top };
}

function sideInset(value: unknown): number | null {
  if (value === undefined || value === 'auto') {
    return 0;
  }
  const length = readLength(value);
  return length === null ? null : length.pt;
}

/** Resolve the geometry the panel shows for the item at `path`. `null` when
 * no geometry can back it (no render yet, the box absent, a hostile envelope)
 * — the caller degrades to plain editable fields. A per-axis `null` inside a
 * returned struct means only that axis is unresolvable. Freshness is NOT
 * checked here — displays/seeds stay stable across a render cycle; the caller
 * gates the pin ACTION on `geometry.fresh`. */
export function resolvePlacement(
  geometry: PlacementGeometry | null,
  read: ReadFn,
  path: string,
  placement: Placement,
): ResolvedPlacement | null {
  if (geometry === null) {
    return null;
  }
  const child = findBox(geometry.boxes, path);
  if (child === undefined) {
    return null;
  }
  const w = fmt(child.border.w);
  const h = fmt(child.border.h);
  if (placement.kind === 'pinnable') {
    return resolvePinnable(geometry.boxes, read, path, child.border, w, h);
  }
  if (placement.kind === 'coordinate') {
    const [top, , , left] = geometry.margin;
    return { x: fmt(child.border.x - left), y: fmt(child.border.y - top), w, h };
  }
  // flow (and any resolvable non-pinnable): page-origin coordinates — the y is
  // display-only (never authored back), so no identity constraint.
  return { x: fmt(child.border.x), y: fmt(child.border.y), w, h };
}

function resolvePinnable(
  boxes: BoxIndex,
  read: ReadFn,
  path: string,
  border: BoxRect,
  w: number | null,
  h: number | null,
): ResolvedPlacement {
  const ownerPath = ownerPathOf(path);
  const parent = ownerPath === null ? undefined : findBox(boxes, ownerPath);
  const inset = childMarginInset(read, path);
  if (parent === undefined || inset === null) {
    return { x: null, y: null, w, h };
  }
  return {
    x: fmt(border.x - parent.content.x - inset.left),
    y: fmt(border.y - parent.content.y - inset.top),
    w,
    h,
  };
}
