// Pure model for the format toolbar: it decides which selection-context
// controls apply to the selected item and constructs the named ops each
// control dispatches. Every op is built through the EXISTING panel op builders
// (`plainTextOp`/`lengthOp`) — one wire grammar, no parallel knowledge of the
// template model. Keeping this framework-free makes applicability + op
// construction exhaustively unit-testable; the component stays thin over it.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readBorder } from '../panel/borderModel';
import { readRadius } from '../panel/borderRadius';
import { BORDERABLE_TYPES, type BorderView, type RadiusView } from '../panel/borderTypes';
import { hasCapability } from '../panel/itemPanelProps';
import { type ItemView, registryNames } from '../panel/itemView';
import { STYLE_FIELDS } from '../panel/styleFieldSpecs';
import { capturableStyleProps, updateTargetName } from '../styles/captureModel';
import type { EffectiveStyles, EffectiveValue } from './effective';
import { alignWire, comboWire, toggleWire } from './wire';

/** The alignment values the toolbar offers. Mirrors the engine `TextAlign`
 * enum; pinned against `STYLE_FIELDS` by a unit test so it cannot drift from
 * the wire (a literal here stays fully coverable — a `STYLE_FIELDS` lookup
 * would leave a dead "key absent" branch). */
export const ALIGN_VALUES = ['left', 'center', 'right'] as const;
export type AlignValue = (typeof ALIGN_VALUES)[number];

/** The `fontWeight` / `fontStyle` value a pressed toggle authors. The unpressed
 * state CLEARS the key (never authors `normal`), so only the "on" value is
 * named here; both are pinned against `STYLE_FIELDS` by a unit test. */
export const BOLD_VALUE = 'bold';
export const ITALIC_VALUE = 'italic';

/** The style key a type's color control writes: text items color their glyphs
 * (`color`), rect items fill their box (`backgroundColor`). */
export type ColorKey = 'color' | 'backgroundColor';

/** The toolbar's view of the selected item — which controls apply and the
 * cascade-EFFECTIVE state each shows (a title bolded via its named style shows
 * B pressed; the ops below still edit only the item's OWN keys, minimally).
 * `null` = the selection has no toolbar controls (no selection, a ghost path,
 * or a type the toolbar does not format), and the bar renders empty at
 * constant height. */
export interface ToolbarModel {
  /** Text formatting controls apply (family/size/bold/italic/align). Only a
   * `text` item; a `rect` shows the fill color + style picker only. */
  readonly typography: boolean;
  /** Which style key the color control edits. */
  readonly colorKey: ColorKey;
  /** The per-key effective resolution (value + below-own cascade + origin). */
  readonly eff: EffectiveStyles;
  readonly bold: boolean;
  readonly italic: boolean;
  /** The effective alignment (`''` = unset — the engine default `left`). */
  readonly align: string;
  /** The effective color at `colorKey` (may be a hostile string — the
   * component guards the swatch preview via `isHexColor`). */
  readonly color: string;
  readonly styleNames: readonly string[];
}

/** Derive the toolbar model from an item view + the effective resolution.
 * Mirrors the panel's styled-type set (`BORDERABLE_TYPES`): `text` gets
 * typography + text color; the other boxed types (`rect`/`container`/`table`/
 * `image`/`qr_code`) get fill color; all get the style picker and the border
 * control. Any other type (or `null`) → no controls. */
export function readToolbar(view: ItemView | null, eff: EffectiveStyles): ToolbarModel | null {
  if (view === null || !BORDERABLE_TYPES.has(view.type)) {
    return null;
  }
  const typography = view.type === 'text';
  return {
    typography,
    colorKey: typography ? 'color' : 'backgroundColor',
    eff,
    bold: typography && eff.fontWeight.value === BOLD_VALUE,
    italic: typography && eff.fontStyle.value === ITALIC_VALUE,
    align: typography ? eff.textAlign.value : '',
    color: typography ? eff.color.value : eff.backgroundColor.value,
    styleNames: view.styleNames,
  };
}

/** Everything the toolbar DERIVES about the selection once, so the clusters
 * take one context instead of nine threaded values: the style-capture inputs
 * (`captured`/`canCapture`/`registry`/`updateTarget`), the picker's rows and
 * its visibility gate, and the border control's gate + its read views. Built by
 * `formatContext` at the toolbar root; the capture modal reads the same object
 * rather than re-deriving it. */
export interface FormatContext {
  /** The selection's capturable inline style props (the modal's payload). */
  readonly captured: Record<string, string | number>;
  /** The selection has ≥1 capturable inline prop (offers "save as style"). */
  readonly canCapture: boolean;
  /** The document's registered style names. */
  readonly registry: readonly string[];
  /** The highest-precedence real applied style ("update to match"), or null. */
  readonly updateTarget: string | null;
  /** The picker's rows: the registry ∪ the item's own names. */
  readonly styleOptions: readonly string[];
  /** Whether the style picker renders — false leaves no dangling separator. */
  readonly showStyles: boolean;
  /** Whether the engine supports borders (the control's capability gate). */
  readonly showBorder: boolean;
  readonly border: BorderView;
  readonly radius: RadiusView;
}

/** Build the toolbar's derived-value context for one selection. Every value is
 * read from the document through `read`; nothing here writes. */
export function formatContext(options: {
  readonly read: ReadFn;
  readonly path: string;
  readonly view: ItemView;
  readonly raw: unknown;
  readonly capabilities: readonly string[] | undefined;
}): FormatContext {
  const { read, path, view, raw, capabilities } = options;
  const captured = capturableStyleProps(raw);
  const canCapture = Object.keys(captured).length > 0;
  const registry = registryNames(read('styles'));
  const styleOptions = Array.from(new Set([...registry, ...view.styleNames]));
  return {
    captured,
    canCapture,
    registry,
    updateTarget: updateTargetName(view.styleNames, registry),
    styleOptions,
    showStyles: styleOptions.length > 0 || canCapture,
    // The border control shows for every boxed item when the engine supports
    // borders; its per-side matrix / line style are gated inside the editor.
    showBorder: hasCapability(capabilities, 'style.border'),
    border: readBorder(read, path),
    radius: readRadius(read, path),
  };
}

/** The toolbar's own-style key path for `key`. Every builder below is the same
 * `toolbar/wire` decision aimed at `style.*`; the band and column editors aim
 * the identical decisions at their own key paths. */
function styleKeys(key: string): readonly string[] {
  return ['style', key];
}

/** Toggle `fontWeight` toward `next` (minimal wire over the cascade). */
export function fontWeightOp(path: string, eff: EffectiveValue, next: boolean): Op | null {
  return toggleWire(path, styleKeys('fontWeight'), eff, BOLD_VALUE, next);
}

/** Toggle `fontStyle` toward `next` (minimal wire over the cascade). */
export function fontStyleOp(path: string, eff: EffectiveValue, next: boolean): Op | null {
  return toggleWire(path, styleKeys('fontStyle'), eff, ITALIC_VALUE, next);
}

/** Click alignment `value`: clicking the active one reverts to the cascade
 * (drops the own key); otherwise author the minimal wire — nothing when the
 * cascade already yields it, an own key when it does not. */
export function alignOp(path: string, eff: EffectiveValue, value: AlignValue): Op | null {
  return alignWire(path, styleKeys('textAlign'), eff, value);
}

/** Set `fontFamily`; `''` clears the own key (back to the cascade). */
export function fontFamilyOp(path: string, eff: EffectiveValue, raw: string): Op | null {
  return comboWire(path, styleKeys('fontFamily'), eff, raw, false);
}

/** Set `fontSize` (a bare number authors a number, a unit string a string,
 * empty clears — the panel's length policy, reused verbatim). */
export function fontSizeOp(path: string, eff: EffectiveValue, raw: string): Op | null {
  return comboWire(path, styleKeys('fontSize'), eff, raw, true);
}

/** Set the color at `key`; `''` clears the own key (back to the cascade). */
export function colorOp(
  path: string,
  key: ColorKey,
  eff: EffectiveValue,
  value: string,
): Op | null {
  return comboWire(path, styleKeys(key), eff, value, false);
}

/** The `textAlign` options as the engine spells them — for the drift-guard
 * test to cross-check `ALIGN_VALUES` / `BOLD_VALUE` / `ITALIC_VALUE`. */
export function styleEnumOptions(key: string): readonly string[] {
  const spec = STYLE_FIELDS.find((field) => field.key === key);
  return spec === undefined ? [] : spec.options;
}
