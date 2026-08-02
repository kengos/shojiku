// What an edge click or a preset AUTHORS. Two layers, one direction: the
// gesture layer decides the DESIRED per-side state (an edge exactly matching
// the pen clears, anything else takes the pen; the presets set every side or
// none), and the wire layer below it authors that state as the item's OWN keys
// in the SIMPLEST form (all-equal → scalar, partial → a non-zero-sides-only
// map, empty → removeKey) touching only the property that actually changed, so
// an untouched authored form stays byte-exact.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { record } from './borderModel';
import {
  allBlank,
  allEqual,
  SIDES,
  type Side,
  type SideMap,
  sameSides,
  sparseMap,
  uniform,
  withSide,
} from './borderSides';
import {
  type BorderProp,
  type BorderStyleValue,
  type BorderView,
  MAX_BORDER_WIDTH,
  type Pen,
} from './borderTypes';

/** The pen's `style` in wire form: `solid` authors nothing (the default), so an
 * ordinary solid border stays a bare `borderWidth`. */
function styleWire(style: BorderStyleValue): string {
  return style === 'solid' ? '' : style;
}

/** Clamp a desired width per-side to the engine's 0..=1000 range (a hostile pen
 * can carry an out-of-range number; the read side already floors negatives). */
function clampWidths(sides: SideMap<number>): SideMap<number> {
  return {
    top: Math.min(sides.top, MAX_BORDER_WIDTH),
    right: Math.min(sides.right, MAX_BORDER_WIDTH),
    bottom: Math.min(sides.bottom, MAX_BORDER_WIDTH),
    left: Math.min(sides.left, MAX_BORDER_WIDTH),
  };
}

/** Build the ops that write one border property's desired per-side state as the
 * item's OWN value, in the simplest form, or `[]` when nothing must change.
 *
 * - All-blank + a below-own cascade provides it (WIDTH only) → author a `0`
 *   scalar to OVERRIDE the inherited border (removeKey would revert to it).
 * - All-blank otherwise → removeKey (revert to nothing) / nothing when absent.
 * - Unchanged vs the own value → nothing (touched-keys-only: bytes preserved).
 * - All-equal non-blank → a bare scalar (collapses a uniform map too).
 * - Partial map, own ALREADY a map → per-side leaf ops (setScalar the changed
 *   sides, removeKey the emptied ones) so untouched sides stay byte-exact.
 * - Partial map, own scalar/absent → a non-blank-sides-only map `putValue` (a
 *   scalar→map transition fails `setScalar`'s leaf write).
 */
function writeProp<T>(
  path: string,
  key: string,
  desired: SideMap<T>,
  prop: BorderProp<T>,
  blank: T,
  isWidth: boolean,
): Op[] {
  const keys = ['style', key];
  // The "did this change" baseline is the EFFECTIVE value (what the item renders
  // now), NOT the own value — so editing one property of a border sourced from a
  // named style authors only the CHANGED property, never a redundant own copy of
  // the unchanged ones (touched-keys-only across the cascade). When own IS a map,
  // effective == own, so the per-side leaf diff below is still against own.
  if (allBlank(desired, blank)) {
    if (isWidth && !allBlank(prop.cascade, blank)) {
      // WIDTH with an inherited border: 0 overrides it. Skip if own is already 0.
      return prop.ownRaw === 0 ? [] : [{ op: 'setScalar', path, keys, value: 0 }];
    }
    return prop.ownPresent ? [{ op: 'removeKey', path, keys }] : [];
  }
  if (sameSides(desired, prop.effective)) {
    return [];
  }
  if (allEqual(desired)) {
    return [{ op: 'setScalar', path, keys, value: desired.top as unknown as string | number }];
  }
  if (record(prop.ownRaw) !== undefined) {
    // Own is already a map (so effective == own) — touch only the changed sides.
    const ops: Op[] = [];
    for (const s of SIDES) {
      if (desired[s] === prop.effective[s]) {
        continue;
      }
      ops.push(
        desired[s] === blank
          ? { op: 'removeKey', path, keys: [...keys, s] }
          : {
              op: 'setScalar',
              path,
              keys: [...keys, s],
              value: desired[s] as unknown as string | number,
            },
      );
    }
    return ops;
  }
  return [{ op: 'putValue', path, keys, value: sparseMap(desired, blank) as SnippetValue }];
}

/** Emit the ops for a desired full-border state (all three properties), pruning
 * color/style residue when no side draws. Empty when nothing changed. */
function stateOps(
  path: string,
  view: BorderView,
  width: SideMap<number>,
  color: SideMap<string>,
  style: SideMap<string>,
): Op[] {
  const w = clampWidths(width);
  // No side draws → clear color/style residue too (inert without a width).
  const drawsNone = allBlank(w, 0);
  const c = drawsNone ? uniform('') : color;
  const s = drawsNone ? uniform('') : style;
  return [
    ...writeProp(path, 'borderWidth', w, view.width, 0, true),
    ...writeProp(path, 'borderColor', c, view.color, '', false),
    ...writeProp(path, 'borderStyle', s, view.style, '', false),
  ];
}

/** Whether a side's effective border exactly matches the pen (→ a click clears
 * it, rather than re-applying). */
function matchesPen(view: BorderView, side: Side, pen: Pen): boolean {
  return (
    view.width.effective[side] === pen.width &&
    view.color.effective[side] === pen.color &&
    (view.style.effective[side] === '' ? 'solid' : view.style.effective[side]) === pen.style
  );
}

/** The current effective per-side map for a property (the edit baseline). */
function mapOf(view: BorderView, prop: 'width'): SideMap<number>;
function mapOf(view: BorderView, prop: 'color' | 'style'): SideMap<string>;
function mapOf(
  view: BorderView,
  prop: 'width' | 'color' | 'style',
): SideMap<number> | SideMap<string> {
  return view[prop].effective;
}

/** Toggle one edge with the pen: an OFF edge (or one showing a different line)
 * takes the pen; an edge exactly matching the pen is cleared. */
export function edgeOps(path: string, view: BorderView, side: Side, pen: Pen): Op[] {
  const on = !matchesPen(view, side, pen);
  const width = withSide(mapOf(view, 'width'), side, on ? pen.width : 0);
  const color = withSide(mapOf(view, 'color'), side, on ? pen.color : '');
  const style = withSide(mapOf(view, 'style'), side, on ? styleWire(pen.style) : '');
  return stateOps(path, view, width, color, style);
}

/** Apply a preset: `all` = the pen on every side, `none` = clear every side. */
export function presetOps(path: string, view: BorderView, kind: 'all' | 'none', pen: Pen): Op[] {
  if (kind === 'none') {
    return stateOps(path, view, uniform(0), uniform(''), uniform(''));
  }
  return stateOps(
    path,
    view,
    uniform(pen.width),
    uniform(pen.color),
    uniform(styleWire(pen.style)),
  );
}
