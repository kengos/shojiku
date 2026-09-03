// How the engine reads a UNIFORM border — the rule shared by every surface that
// strokes one closed path instead of four bands: a `char_grid`'s cell ruling and
// the two form marks' outlines (`ellipse`, `checkbox`), which all resolve through
// `Ctx::shape_paint` / `push_grid_rects` rather than through `push_decoration`.
//
// The two surfaces reach that rule through DIFFERENT engine code, so read both
// before changing anything here:
//
//   * `engine/layout/src/engine/char_grid.rs` states it literally — the width is
//     `bw.uniform().unwrap_or_else(|| bw.sides()[0])` (:196) and `authored()`
//     (:230) walks `styleNames`, then the item's own style, and NOTHING below.
//   * `engine/layout/src/engine/marks.rs`'s `shape_paint` (:190-230) quotes
//     neither: it takes `computed.border_widths[0]` off
//     `resolve_style(names, inline)` and keeps a separate `authored` presence
//     flag over the `MAX_STYLE_NAMES` window.
//
// They agree, for two independent reasons worth writing down rather than
// re-deriving: `ComputedStyle::overlaid` replaces `border_width` WHOLESALE
// (`style.rs:213`, `self.border_widths = v.sides()`), so a later layer never
// merges into an earlier one side-wise; and `ComputedStyle::base` resets
// `backgroundColor`/`borderWidth`/`borderColor` as NON-inherited
// (`style.rs:145-165`), so there is nothing below the named styles to fall to.
//
// Both facts are load-bearing for what a control may author:
//
//   * a per-side MAP silently collapses to its TOP side. Reading through the
//     generic cascade instead would flatten a map to unset and report a set
//     stroke as blank.
//   * the resolution is by key PRESENCE, not by whether a value happens to
//     display as something: an item authoring `borderWidth: { bottom: 1 }` over
//     a style's `borderWidth: 2` strokes at ZERO (the top side is unset), while
//     a display-based fallthrough would show `2` and name the style — the panel
//     contradicting the canvas beside it.
//
// The DEFAULT an absent key means differs per surface (0.5pt for a grid ruling,
// 1pt for a form mark), so it is not decided here — each caller states its own.
// So does the `MAX_STYLE_NAMES` (16) window: `resolveUniform` applies none, so
// "later name wins" is really "later of however many the engine reads".

import { namedValue, ownValue, record } from './borderModel';
import { display } from './itemView';

/** Where a uniform border value came from. */
export interface UniformBorderValue {
  /** The value as the engine reads it (`''` = unset). */
  readonly value: string;
  /** The named style that supplied it, so a control can say it is not the
   * item's own. `null` when the item authors it, or when nothing does. */
  readonly styleName: string | null;
}

/** A `borderWidth`/`borderColor` value as the engine reads it: a scalar outright,
 * or a per-side map's TOP side. Anything else is unset.
 *
 * A map with no `top` therefore reads as `''` — which is the truth about what is
 * drawn (`sides()` gives an unset side `0.0`) but is NOT the same thing as the key
 * being absent. Which layer wins is decided before this runs. */
export function topSide(raw: unknown): string {
  const asMap = record(raw);
  return asMap === undefined ? display(raw) : display(asMap.top);
}

/** Resolves one uniform-border key against an item and the style registry, the
 * way the engine's `authored()` does: the item's own value of ANY shape wins, and
 * only if the key is absent are the named styles consulted. */
export function resolveUniform(
  item: Record<string, unknown>,
  registry: Record<string, unknown>,
  key: string,
): UniformBorderValue {
  const own = ownValue(item, key);
  if (own !== undefined) {
    return { value: topSide(own), styleName: null };
  }
  const found = namedValue(item, registry, key);
  return found === null
    ? { value: '', styleName: null }
    : { value: topSide(found.raw), styleName: found.styleName };
}
