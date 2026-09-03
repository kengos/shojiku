// What a border IS, as the panel and the toolbar speak of it: the line-style
// keywords the engine accepts (and the subset an older engine parse-rejects),
// the item types that get a border box at all, the editor-local "pen", and the
// resolved views the read side produces. A no-behavior leaf — every border
// module plus the decoration tab, the item panel, the line-style editor and the
// format toolbar import their vocabulary from here.

import type { SideMap } from './borderSides';

/** The line styles the engine accepts (`BorderStyleKind`). Pinned
 * against `engine/core/src/style/border.rs` by a drift-guard test — a literal
 * here stays fully coverable (a source lookup would leave a dead branch), while
 * the test guarantees it cannot silently drift from the wire. */
export const BORDER_STYLE_VALUES = ['solid', 'double', 'dashed', 'dotted'] as const;
export type BorderStyleValue = (typeof BORDER_STYLE_VALUES)[number];

/** The styles gated behind the `style.borderStyle.dashed_dotted` capability —
 * an older engine parse-REJECTS these keywords, so the picker must not offer
 * them against one. `solid`/`double` ride the older `style.borderStyle` key. */
export const PATTERNED_BORDER_STYLES: readonly BorderStyleValue[] = ['dashed', 'dotted'];

/** The item types whose own border/fill the editor decorates — every boxed item
 * the engine draws a border box for. The decoration tab's fill-and-border cluster and the
 * toolbar's border/fill controls both key off this set (`text` additionally
 * gets typography).
 *
 * Three insertable types are excluded BECAUSE their stroke is not a border box,
 * and each has its own editor instead: `line`, whose stroke is its own
 * `width`/`color` shape (`LineStyleEditor`), and the two form marks
 * (`MARK_TYPES`), which stroke one closed path (`ShapeStyleEditor`).
 *
 * They are NOT the only insertable types outside this set — `page_number`,
 * `list` and `repeat_flow` are too, and they have no decoration tab at all,
 * which for `list` is a real gap (`engine/layout/src/engine/list.rs` calls
 * `push_decoration` on one, so the engine does draw its border box). Queued
 * separately; do not read this set's exclusions as one rule. */
export const BORDERABLE_TYPES: ReadonlySet<string> = new Set([
  'text',
  'rect',
  'container',
  'table',
  'image',
  'qr_code',
]);

/** Where an effective border property resolves from (a subset of the general
 * cascade — borders are non-inherited, so never `inherited`/`default`). */
export type BorderOrigin = 'own' | 'style' | 'unset';

/** The "pen": what an edge click / preset applies. `color: ''` = the engine
 * default (black); `style: 'solid'` authors nothing (the default). Editor-local
 * state, never persisted. */
export interface Pen {
  readonly width: number;
  readonly color: string;
  readonly style: BorderStyleValue;
}

/** One resolved border property: the effective per-side values (for the
 * diagram), its origin, and the raw own form + below-own cascade (for writes). */
export interface BorderProp<T> {
  readonly effective: SideMap<T>;
  readonly origin: BorderOrigin;
  /** The winning named style when `origin` is `'style'`, else `''`. */
  readonly styleName: string;
  /** The item's own raw wire value (`undefined` = absent). */
  readonly ownRaw: unknown;
  readonly ownPresent: boolean;
  /** The below-own (named-style) per-side value — the override baseline. */
  readonly cascade: SideMap<T>;
}

export interface BorderView {
  readonly width: BorderProp<number>;
  readonly color: BorderProp<string>;
  readonly style: BorderProp<string>;
}

/** `borderRadius` resolved through the same cascade as the per-side keys, but
 * kept as ONE authored string. The AUTHORED FORM is what the field shows and
 * writes back: `50%` must round-trip as `50%`, never be re-expressed in pt
 * (a unit rewrite on a mere tab-through is a silent 25× change of geometry). */
export interface RadiusView {
  /** The cascade-effective authored value (`''` = square corners). */
  readonly effective: string;
  readonly origin: BorderOrigin;
  /** The winning named style when `origin` is `'style'`, else `''`. */
  readonly styleName: string;
  readonly ownPresent: boolean;
}

/** The write cap the engine enforces on a stroke width — `borderWidth`
 * (`invalid_border_width`) and the `line` item's `style.width`
 * (`invalid_line_width`) share one 0..=1000 bound, because both reach the
 * renderers' stroke math directly. Clamping GUI-side keeps a hostile pen from
 * authoring an out-of-range value the engine would only warn on. */
export const MAX_STROKE_WIDTH = 1000;
