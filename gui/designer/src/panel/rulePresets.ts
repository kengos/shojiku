// The format presets a row-condition rule offers — Google Sheets' conditional
// formatting "formatting style" samples: a fill with a matching dark text, a
// dimmed text, bold. A preset picks a FORMAT, never a purpose; which rows it
// applies to stays the rule's condition.
//
// Applying one authors the keys it declares over a FIXED owned set and removes
// the owned keys it does not declare, in one batch; any other key the rule
// carries (an alignment, a font) is never touched — the table-style gallery's
// rule (`tableStylePresets`). The active preset is derived from the WIRE each
// render, so no selection state is held. Lookup is a `Map`: a preset id is a
// string from a click handler, and a `Record` would answer `constructor`.

import type { Op } from '@shojiku/designer-core';

/** The rule style keys a preset owns. */
const OWNED = ['backgroundColor', 'color', 'fontWeight'] as const;
type Owned = (typeof OWNED)[number];

export type RulePreset = Readonly<Partial<Record<Owned, string>>>;

/** In gallery order. Colours are Sheets' default conditional-format pairs. */
export const RULE_PRESETS: ReadonlyMap<string, RulePreset> = new Map<string, RulePreset>([
  ['green', { backgroundColor: '#b7e1cd', color: '#0d652d' }],
  ['red', { backgroundColor: '#f4c7c3', color: '#a50e0e' }],
  ['yellow', { backgroundColor: '#fce8b2', color: '#7f6000' }],
  ['blue', { backgroundColor: '#c6dafc', color: '#174ea6' }],
  ['dim', { color: '#9aa0a6' }],
  ['bold', { fontWeight: 'bold' }],
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The preset whose owned keys the rule's own `style` carries EXACTLY, or
 * `null` — a rule with an extra owned key, or a different value, is hand-tuned. */
export function matchRulePreset(rule: unknown): string | null {
  const style = record(record(rule)?.style) ?? {};
  for (const [id, preset] of RULE_PRESETS) {
    if (
      OWNED.every((key) => (Object.hasOwn(style, key) ? style[key] : undefined) === preset[key])
    ) {
      return id;
    }
  }
  return null;
}

/** The ops that make the rule at `rulePath` carry preset `id`; empty for an
 * unknown id. Removes only owned keys the rule actually has. */
export function rulePresetOps(rulePath: string, rule: unknown, id: string): readonly Op[] {
  const preset = RULE_PRESETS.get(id);
  if (preset === undefined) {
    return [];
  }
  const style = record(record(rule)?.style) ?? {};
  const ops: Op[] = [];
  for (const key of OWNED) {
    const value = preset[key];
    if (value !== undefined) {
      ops.push({ op: 'setScalar', path: rulePath, keys: ['style', key], value });
    } else if (Object.hasOwn(style, key)) {
      ops.push({ op: 'removeKey', path: rulePath, keys: ['style', key] });
    }
  }
  return ops;
}
