// Cascade-EFFECTIVE style resolution for the format toolbar: what the
// selected item actually renders with, not just its own `style` keys — so a
// title bolded via its named style shows B pressed (with a "from style" hint)
// instead of lying unpressed. A bounded GUI-side mirror of the engine cascade
// (docs/engine/style.md, low → high): engine default ← inherited ancestor ←
// named styles in listed order (later wins) ← inline style. The ancestor layer
// covers `container` ancestors' own+named styles (the sub-template chrome the
// engine also cascades through is outside this v1 walk); the inheritance-gated
// layers apply to inherited properties only. If the inspect wire ever carries
// resolved style, this walk is the code to delete.
//
// The layers themselves are gathered by `toolbar/cascade`; this module is the
// per-key RESOLUTION over them.
//
// Ops stay minimal-wire: the toolbar's builders (toolbar/model) consult the
// `cascade` value (effective EXCLUDING the own layer) so toggling authors an
// own key only when the cascade does not already yield the target.

import type { ReadFn } from '@shojiku/designer-core';
import { INHERITED_STYLE_FIELDS } from '../panel/defaultsModel';
import { display } from '../panel/itemView';
import { type CascadeContext, cascadeContext, levelValue, namedValue, record } from './cascade';

/** The style keys the toolbar renders/edits. */
export const TOOLBAR_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'color',
  'backgroundColor',
] as const;
export type ToolbarStyleKey = (typeof TOOLBAR_STYLE_KEYS)[number];

// `default` = a value authored in `defaults.style`; `engine` = the engine's own
// built-in default (the floor below `defaults.style` — an unset inherited key
// still renders with a real value, and the toolbar/panel show it as the default origin).
export type StyleOrigin = 'own' | 'style' | 'inherited' | 'default' | 'engine' | 'unset';

export interface EffectiveValue {
  /** The cascade-resolved display value (`''` = unset everywhere — the
   * engine default applies). */
  readonly value: string;
  /** The resolved value EXCLUDING the item's own `style` layer — what the
   * item would render with if its own key were removed. */
  readonly cascade: string;
  /** The item's own `style` value (`''` = absent). */
  readonly own: string;
  /** Where `value` comes from. */
  readonly origin: StyleOrigin;
  /** The winning named style when `origin` is `'style'`, else `''`. */
  readonly styleName: string;
}

export type EffectiveStyles = Readonly<Record<ToolbarStyleKey, EffectiveValue>>;

/** Inherited properties (the ancestor/defaults layers apply only to these —
 * among the toolbar's keys everything but `backgroundColor`). */
const INHERITED_KEYS: ReadonlySet<string> = new Set(INHERITED_STYLE_FIELDS.map((f) => f.key));

/** One style key's cascade-effective value over a prepared context — THE mirror
 * of the engine cascade (docs/engine/style.md), shared by the format toolbar
 * (`effectiveStyles`, the fixed `TOOLBAR_STYLE_KEYS`) and the property panel
 * (its full `STYLE_FIELDS` set). Never a second cascade. The own layer wins;
 * below it, named styles (later wins), then — for INHERITED keys only —
 * container ancestors innermost-out, then `defaults.style`. */
export function effectiveValueIn(ctx: CascadeContext, key: string): EffectiveValue {
  const own = display(record(ctx.item.style)?.[key]);
  let cascade = '';
  let origin: StyleOrigin = 'unset';
  let styleName = '';
  const named = namedValue(ctx.item, ctx.registry, key);
  if (named !== null) {
    cascade = named.value;
    origin = 'style';
    styleName = named.styleName;
  } else if (INHERITED_KEYS.has(key)) {
    for (const ancestor of ctx.ancestors) {
      const inherited = levelValue(ancestor, ctx.registry, key);
      if (inherited !== '') {
        cascade = inherited;
        origin = 'inherited';
        break;
      }
    }
    if (cascade === '') {
      const fromDefaults = display(ctx.defaults[key]);
      if (fromDefaults !== '') {
        cascade = fromDefaults;
        origin = 'default';
      } else if (Object.hasOwn(ctx.floor, key)) {
        // The engine-default floor: own-property access only (the key is closed
        // vocab, but the floor map is guarded regardless). A present floor
        // entry is a real value, so an unset inherited key shows the default origin.
        cascade = display(ctx.floor[key]);
        origin = 'engine';
      }
    }
  }
  return own !== ''
    ? { value: own, cascade, own, origin: 'own', styleName: '' }
    : { value: cascade, cascade, own: '', origin, styleName };
}

/** Resolve the toolbar keys' effective values for the item at `path`, over the
 * optional engine-default `floor` (an unset inherited key resolves to its real
 * engine default with origin `engine`). */
export function effectiveStyles(
  read: ReadFn,
  path: string,
  floor?: Readonly<Record<string, unknown>>,
): EffectiveStyles {
  const ctx = cascadeContext(read, path, floor);
  const out = {} as Record<ToolbarStyleKey, EffectiveValue>;
  for (const key of TOOLBAR_STYLE_KEYS) {
    out[key] = effectiveValueIn(ctx, key);
  }
  return out;
}
