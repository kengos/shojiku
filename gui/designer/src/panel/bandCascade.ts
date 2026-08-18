// The cascade CONTEXT of a table's style bands — the read half of "what does
// this band actually render with", composed rather than looked up.
//
// A column has a structural path, so `toolbar/cascade` already gathers its
// layers (`columns[n]` sits on the row band, then the table). The two BANDS do
// not: `header` and `row` are map keys under the table item, not indices, so
// there is no path to hand `cascadeContext`. Their layers are therefore built
// from the TABLE's context — which is exactly the engine's own arrangement, and
// the reason this is a composition and not a second cascade:
// `engine/layout/src/engine/table/atom.rs` sets the inherited context to the
// table's computed style around both the header atom and every row atom, so a
// band's own `style`/`styleNames` resolve directly over the table.
//
// Only INHERITED properties travel any of this (`ComputedStyle::base` resets the
// rest), so `backgroundColor` has no cascade between the header band, the body
// band and a column. A body cell looks like it carries the row band's fill
// because the row band PAINTS beneath it — paint order, not a cascade, and the
// panel must not report it as one.
//
// The row-condition RULE is the exception, and this module does not yet express
// it: `apply_row_conditions` overlays a matching rule onto the already-resolved
// row `ComputedStyle` rather than starting from `base`
// (`engine/layout/src/engine/table/style/conditional.rs`), so the body band's
// `backgroundColor` really does survive into the rule and paint the matching
// rows. `effectiveValueIn` gates the ancestor walk on a GLOBAL inherited-key set,
// so saying so would need a per-context notion of which keys travel — and one
// that stops after the first ancestor, since the table's own background reaches
// nothing. Until then a rule card's background swatch reads blank while the band
// supplies a colour. Filed rather than bodged.

import type { ReadFn } from '@shojiku/designer-core';
import { type CascadeContext, cascadeContext, record } from '../toolbar/cascade';
import { type EffectiveValue, effectiveValueIn } from '../toolbar/effective';
import { BOLD_VALUE } from '../toolbar/model';

/** One band's context: its own `style`/`styleNames` as the item, with the table
 * pushed in as the innermost ancestor layer ahead of whatever the table itself
 * sits on. A hostile owner (a string, a sequence, absent) yields an empty item
 * rather than throwing — the panel-wide posture. */
export function bandContext(tableCtx: CascadeContext, owner: unknown): CascadeContext {
  const band = record(owner) ?? {};
  return {
    ...tableCtx,
    item: { style: band.style, styleNames: band.styleNames },
    ancestors: [tableCtx.item, ...tableCtx.ancestors],
  };
}

/** The two band contexts for one table, read in ONE pass over the document so
 * the section resolves eight keys against a prepared context rather than
 * re-reading per control. */
export interface BandCascades {
  readonly header: CascadeContext;
  readonly row: CascadeContext;
}

export function readBandCascades(
  read: ReadFn,
  tablePath: string,
  floor?: Readonly<Record<string, unknown>>,
): BandCascades {
  const tableCtx = cascadeContext(read, tablePath, floor);
  return {
    header: bandContext(tableCtx, tableCtx.item.header),
    row: bandContext(tableCtx, tableCtx.item.row),
  };
}

/** The layers ONE row-condition rule sits on: its own style, then the BODY band,
 * then the table. Two applications of `bandContext`, because that is literally
 * the engine's shape — `apply_row_conditions` overlays a matching rule on the
 * already-resolved row style. `alternateStyle` is deliberately NOT a layer, for
 * the same reason `toolbar/cascade` leaves it out of a column's: the zebra
 * applies to every other row and the card shows one value.
 *
 * This is the engine's shape for the three INHERITED properties. It is not the
 * whole shape for `backgroundColor`, which the engine carries into a rule from
 * the band (see the header note); the panel does not show that yet. */
export function ruleContext(tableCtx: CascadeContext, rule: unknown): CascadeContext {
  return bandContext(bandContext(tableCtx, tableCtx.item.row), rule);
}

/** The header band's fill as an effective value: whatever the band RESOLVES to
 * — its own `style`, else its `styleNames` — and only failing both, the engine's
 * `#ededed`. Resolving rather than reading `header.style.backgroundColor` is the
 * whole point: `table_header_atom` calls `resolve_style(names, inline)` and falls
 * back to the floor only when THAT produced nothing, so a header tinted through a
 * named style paints that colour while a wire-only read would report the floor —
 * and then the origin line, the one floor value this panel defends showing, would
 * be stating something false. */
export function headerFillOf(ctx: CascadeContext, floorFill: string): EffectiveValue {
  const resolved = effectiveValueIn(ctx, 'backgroundColor');
  if (resolved.value !== '') {
    return resolved;
  }
  return { value: floorFill, cascade: floorFill, own: '', origin: 'engine', styleName: '' };
}

/** What the MINIATURE draws for one band: the effective ink, not the authored
 * one. The miniature is a figure of the PAGE, so a colour the band inherits has
 * to reach it — a fixed ink is how a dark header once rendered dark-on-dark. */
export function bandInk(ctx: CascadeContext): {
  readonly color: string;
  readonly bold: boolean;
  readonly fill: string;
} {
  return {
    color: effectiveValueIn(ctx, 'color').value,
    bold: effectiveValueIn(ctx, 'fontWeight').value === BOLD_VALUE,
    // The fill too: `backgroundColor` reaches no ancestor, but a band's own
    // `styleNames` supply it, and a miniature drawn from the wire alone shows a
    // named-style tint as blank paper.
    fill: effectiveValueIn(ctx, 'backgroundColor').value,
  };
}

/** Whether an effective value's origin is something the DOCUMENT created — a
 * named style, an inherited ancestor, or `defaults.style`. The band editors
 * narrate exactly those with an origin LINE and stay silent about the engine
 * floor: `left`, `#000000` and `normal` always resolve, so a line for each would
 * be permanent chrome on every band saying nothing. (`own` and `unset` render
 * nothing either way — that is `OriginBadge`'s own rule.) */
export function documentOrigin(eff: EffectiveValue): boolean {
  return eff.origin === 'style' || eff.origin === 'inherited' || eff.origin === 'default';
}
