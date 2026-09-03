// The INK half of a `char_grid` item: the ruling that draws the cells, the ruby
// size, and the line-breaking rule. `charGrid.ts` owns the geometry (how many cells
// and how big); this owns what is drawn in and around them.
//
// Split from the geometry model because the two answer different questions and read
// different places on the wire: the geometry lives under the item's own `grid` map,
// while the ruling is a STYLE property (`style.borderWidth` / `style.borderColor`)
// that a named style can also supply.
//
// Three engine facts this file is written against, each read from the engine source
// rather than assumed, because every one of them changes what an op may author:
//
//   * `push_grid_rects` takes `grid_border.unwrap_or(0.5)` and returns early when
//     `width <= 0.0`. So an ABSENT key means a 0.5pt ruling and an explicit `0`
//     means no ruling at all — the asymmetry the width control has to make legible.
//   * the width is `bw.uniform().unwrap_or_else(|| bw.sides()[0])` and the colour is
//     `computed.border_colors[0]`: a per-side MAP silently collapses to its top
//     side. The panel therefore reads the same way rather than through the generic
//     cascade, which flattens a map to unset and would report a set ruling as blank.
//   * `authored()` walks `styleNames` (later name wins) and then the item's own
//     style, which wins over all of them. Nothing below that is consulted — no
//     document defaults, no inherited value — so a control here must not badge an
//     effective value it did not find in those two places.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readRecord } from './borderModel';
import { display } from './itemView';
import { lengthOp, plainTextOp } from './model';
import { resolveUniform } from './uniformBorder';

/** Line-breaking rule sets the engine accepts, and its default. Copied from the
 * wire (`KinsokuMode`), never guessed. */
export const KINSOKU_MODES = ['school', 'none'] as const;
export type KinsokuMode = (typeof KINSOKU_MODES)[number];
export const DEFAULT_KINSOKU: KinsokuMode = 'school';

/** The engine's stroke sanity range (`MAX_STROKE_WIDTH_PT`). A width outside it is
 * refused here rather than authored, because the engine answers one with an
 * `invalid_border_width` diagnostic and falls back — an author would see the panel
 * accept a value the document then ignores. */
export const MAX_RULING_WIDTH_PT = 1000;

/** The ruling widths worth offering, in points. `0` is in the list because turning
 * the ruling OFF is a value rather than a separate control, and it is only
 * discoverable if it is on the menu. */
export const RULING_WIDTH_PRESETS = ['0', '0.25', '0.75', '1', '2'] as const;

/** Ruby sizes worth offering, in points — the set the approved mock shows. `10.5` is
 * in it deliberately: it is a standard Japanese body size, and it is the value that
 * decided round 2 against a native `<datalist>`, whose Chrome indicator clips exactly
 * that many characters. */
export const RUBY_SIZE_PRESETS = ['5', '6', '8', '10.5', '12'] as const;

/** What the item says about its own ink. Display strings so an authored unit survives
 * the round trip — true of `rubySize`, which is a `Length`. The ruling WIDTH is a bare
 * pt number on the wire with no string form, so its display string is only ever
 * digits; it is authored as a number, never echoed back as text. */
export interface CharGridInkView {
  /** `''` = unset, which the engine draws as 0.5pt. `'0'` = no ruling. */
  readonly rulingWidth: string;
  /** `''` = unset (the engine falls back to black). */
  readonly rulingColor: string;
  /** Where the width came from, so the control can say it is not the item's own.
   * `null` when the item authors it or nothing does. */
  readonly widthFromStyle: string | null;
  /** The EFFECTIVE rule set — the engine's default when unset, so the control
   * always shows a real choice rather than an empty one. */
  readonly kinsoku: KinsokuMode;
  /** `''` = unset (0.4 × the cell size). */
  readonly rubySize: string;
}

const EMPTY: CharGridInkView = {
  rulingWidth: '',
  rulingColor: '',
  widthFromStyle: null,
  kinsoku: DEFAULT_KINSOKU,
  rubySize: '',
};

// How a uniform border resolves — a scalar or a per-side map's TOP side, own value
// before named styles, by key presence — is the SAME rule the two form marks'
// outlines follow (`Ctx::shape_paint`), so it lives in `uniformBorder.ts` rather
// than here. This file keeps only what is specific to a GRID's ruling.

/** Read the ink the item at `path` authors, own value first and named styles below
 * it — the two places, and the only two, the engine looks. */
export function readCharGridInk(read: ReadFn, path: string): CharGridInkView {
  const item = readRecord(read, path);
  if (Object.keys(item).length === 0) {
    return EMPTY;
  }
  const registry = readRecord(read, 'styles');
  const width = resolveUniform(item, registry, 'borderWidth');
  const colour = resolveUniform(item, registry, 'borderColor');
  const mode = item.kinsoku;
  return {
    rulingWidth: width.value,
    rulingColor: colour.value,
    widthFromStyle: width.styleName,
    kinsoku: KINSOKU_MODES.find((m) => m === mode) ?? DEFAULT_KINSOKU,
    rubySize: display(item.rubySize),
  };
}

/** Whether a typed ruling width is one the engine will honour. */
export function rulingWidthAcceptable(raw: string): boolean {
  const value = Number(raw.trim());
  return Number.isFinite(value) && value >= 0 && value <= MAX_RULING_WIDTH_PT;
}

/** A ruling-width edit.
 *
 * EMPTY CLEARS the key, which is not what the plan first specified — it said empty
 * must reseed, on the reasoning that unset means 0.5pt. That reasoning is the
 * argument FOR clearing: an absent key is the engine's documented 0.5pt default, so
 * clearing returns the ruling to its default rather than to nothing, exactly as
 * clearing `cellSize` returns it to derive-from-width. Reseeding instead would make
 * an authored width permanent — once set there would be no way back to the default
 * except retyping `0.5`, which authors a value the minimal-wire rule says never to
 * write. Turning the ruling OFF is still its own value (`0`), which is the whole
 * point of D2.
 *
 * A value outside the engine's sanity range authors NOTHING and the field reseeds:
 * the engine would answer it with a diagnostic and fall back, so accepting it would
 * show the author a width the document does not use. */
export function rulingWidthOp(path: string, raw: string): Op | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { op: 'removeKey', path, keys: ['style', 'borderWidth'] };
  }
  if (!rulingWidthAcceptable(trimmed)) {
    return null;
  }
  // The ALREADY-PARSED number, never the raw text. `BorderWidth` deserializes from
  // f64/u64/i64 or a map and has no `visit_str` at all, so a string there is a serde
  // type error — a template that no longer loads, not a diagnostic the engine
  // degrades past. `lengthOp` would author one: it keeps the raw text whenever it
  // does not match `/^-?\d+(?:\.\d+)?$/`, and `Number()` is strictly more
  // permissive than that regex, so `.5`, `5.`, `+1`, `1e3` and `0x10` all pass the
  // range check and would be written verbatim. `.5` is the likeliest keystroke of
  // the set. Authoring the parsed value makes the test and the write share one
  // notion of what a number is.
  return { op: 'setScalar', path, keys: ['style', 'borderWidth'], value: Number(trimmed) };
}

/** A ruling-colour edit; `''` clears, which returns the ruling to the engine's
 * black. Written as a SCALAR even when a per-side map is what is there — the engine
 * reads only the top side for a grid, so preserving the other three would keep
 * values that cannot take effect and that no control here can show. */
export function rulingColorOp(path: string, value: string): Op {
  return plainTextOp(path, ['style', 'borderColor'], value);
}

/** A kinsoku pick. The engine's default is never authored — an unset key already
 * means it — so choosing `school` REMOVES the key. */
export function kinsokuOp(path: string, mode: KinsokuMode): Op {
  return plainTextOp(path, ['kinsoku'], mode === DEFAULT_KINSOKU ? '' : mode);
}

/** A ruby-size edit; an optional length, so empty clears back to 0.4 × the cell. */
export function rubySizeOp(path: string, raw: string): Op {
  return lengthOp(path, ['rubySize'], raw);
}
