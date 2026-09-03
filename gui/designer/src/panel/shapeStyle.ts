// Pure model for a FORM MARK's own paint (`ellipse`, `checkbox`): a uniform
// outline plus a fill. Deliberately NOT the border cluster, and the reason is
// the engine rather than taste — `Ctx::shape_paint` strokes one closed path, so
// THREE of the four things `BorderEditor` authors do not reach a mark:
//
//   * a per-side `borderWidth`/`borderColor` map reduces to its TOP side and
//     warns `shape_border_sides_ignored`;
//   * `borderRadius` warns `border_radius_ignored` ("a form mark") and draws
//     square corners — a mark's outline is an oval or a check, not a rectangle
//     whose corners could be rounded;
//   * `borderStyle` (dashed/dotted) is inert and says NOTHING: `shape_paint`
//     never reads `computed.border_styles`, `PathShape` has no dash field, and
//     `Style::ignored_shape_keys` does not list it either, so no
//     `shape_style_ignored` fires. That is why this editor offers no
//     line-style picker — and why a document already carrying one gets no
//     word about it from anywhere.
//
// So this model reads through `uniformBorder` (the same rule the char_grid
// ruling follows) and writes SCALARS only. It authors neither key the engine
// would answer with a diagnostic.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readRecord } from './borderModel';
import { MAX_STROKE_WIDTH } from './borderTypes';
import { plainTextOp } from './model';
import { resolveUniform } from './uniformBorder';

/** The outline width (pt) an absent `borderWidth` means — `DEFAULT_MARK_STROKE_PT`.
 * A mark's visible geometry is its function (a blank form's empty box must
 * print), so unlike a `rect` it strokes without anyone authoring a width. An
 * explicit `0` is what turns the outline off. */
export const DEFAULT_MARK_STROKE_PT = '1';

/** A form mark's paint, as the panel edits it. Display strings, so `''` reads
 * as "unset" everywhere and the placeholder can name the default. */
export interface ShapeStyleView {
  /** `''` = unset (a 1pt outline). `'0'` = no outline. */
  readonly strokeWidth: string;
  /** `''` = unset (the engine falls back to black). Also colours a checkbox's
   * check mark, even on a frameless box. */
  readonly strokeColor: string;
  /** `''` = unset (no fill). */
  readonly fill: string;
  /** The named style supplying the width, when the item does not author it —
   * so the control can say the value is not the item's own. */
  readonly widthFromStyle: string | null;
}

const EMPTY: ShapeStyleView = {
  strokeWidth: '',
  strokeColor: '',
  fill: '',
  widthFromStyle: null,
};

/** Read the paint of the mark at `path`. A hostile or unreadable node reads as
 * unpainted rather than throwing through the panel render. */
export function readShapeStyle(read: ReadFn, path: string): ShapeStyleView {
  const item = readRecord(read, path);
  if (Object.keys(item).length === 0) {
    return EMPTY;
  }
  const registry = readRecord(read, 'styles');
  const width = resolveUniform(item, registry, 'borderWidth');
  const colour = resolveUniform(item, registry, 'borderColor');
  // The fill goes through the SAME resolution: `shape_paint` reads it off
  // `resolve_style(names, inline)` like the other two, so a named style supplies
  // it the same way. Its per-side reduction is simply inert — `background_color`
  // is an `Option<String>` on the wire, so a map there is a parse error rather
  // than a value to display.
  const fill = resolveUniform(item, registry, 'backgroundColor');
  return {
    strokeWidth: width.value,
    strokeColor: colour.value,
    fill: fill.value,
    widthFromStyle: width.styleName,
  };
}

/** Whether a typed outline width is one the engine will honour: a finite
 * non-negative number inside the shared stroke bound. `sane_border_width`
 * answers anything else with a diagnostic and falls back, so accepting it would
 * show the author a width the document does not use. */
export function strokeWidthAcceptable(raw: string): boolean {
  const value = Number(raw.trim());
  return Number.isFinite(value) && value >= 0 && value <= MAX_STROKE_WIDTH;
}

/** An outline-width edit.
 *
 * EMPTY CLEARS the key, because an absent key IS the documented 1pt default —
 * clearing returns the outline to it, and without that an authored width could
 * never be undone except by retyping `1`, which authors a value the minimal-wire
 * rule says never to write. Turning the outline OFF stays its own value (`0`).
 *
 * A refused entry authors NOTHING (`null`), so the field can reseed rather than
 * leave a number on screen the document never took. */
export function strokeWidthOp(path: string, raw: string, ownsWidth = true): Op | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    // Only the item's OWN key can be cleared. The field is seeded with the
    // RESOLVED width, so it can show a value that came from a named style —
    // and `removeKey` on the absent own key returns `key_not_found`, which
    // refuses the batch. Authoring nothing (and reseeding) is the honest
    // answer: the value the reader wants to drop is not this item's to drop.
    return ownsWidth ? { op: 'removeKey', path, keys: ['style', 'borderWidth'] } : null;
  }
  if (!strokeWidthAcceptable(trimmed)) {
    return null;
  }
  // The ALREADY-PARSED number, never the raw text: `BorderWidth` deserializes
  // from f64/u64/i64 or a map and has no `visit_str`, so a string there is a
  // serde type error — a template that no longer loads, not a diagnostic the
  // engine degrades past. `Number()` is strictly more permissive than the
  // numeric-text regex `lengthOp` uses, so `.5`, `5.`, `+1` and `1e3` would all
  // be written verbatim by that path.
  return { op: 'setScalar', path, keys: ['style', 'borderWidth'], value: Number(trimmed) };
}

/** An outline-colour edit; `''` clears, returning the outline to the engine's
 * black. Written as a SCALAR even when a per-side map is what is there — the
 * engine reads only the top side for a shape, so preserving the other three
 * would keep values that cannot take effect and that no control here can show. */
export function strokeColorOp(path: string, value: string): Op {
  return plainTextOp(path, ['style', 'borderColor'], value);
}

/** A fill edit; `''` clears the key, which is what "no fill" is — the engine
 * paints nothing when `backgroundColor` is absent. */
export function fillOp(path: string, value: string): Op {
  return plainTextOp(path, ['style', 'backgroundColor'], value);
}
