// The VALUE RULES of a definitions node other than its choices (`enumModel.ts`):
// the ranges, the blank-form placeholder and the generation example — their raw
// reads at a keys path and the op builders that edit them.
//
// The wire is strict where a mistake costs the whole document: the length and
// count keys (`minLength`, `maxLength`, `minItems`, `maxItems`) are `u64` in the
// engine's schema, so a negative, a fraction or a string there is a PARSE ERROR
// for every template using the file. Those are refused here, before any op
// exists; `minimum` / `maximum` take any finite number. Every builder returns a
// null op when nothing changed, so a tab-through authors nothing, and an empty
// entry CLEARS the key.

import type { Op } from '@shojiku/designer-core';
import { own, readSchemaNode } from './schemaNode';

/** The keys counting characters or elements — non-negative whole numbers. */
export const COUNT_KEYS = ['minLength', 'maxLength', 'minItems', 'maxItems'] as const;
/** The keys bounding a number's value — any finite number. */
export const BOUND_KEYS = ['minimum', 'maximum'] as const;
export type RangeKey = (typeof COUNT_KEYS)[number] | (typeof BOUND_KEYS)[number];

/** Why a typed number was not written (`data.refusal.*` chrome keys). */
export type NumberRefusal = 'not_a_number' | 'not_whole' | 'negative' | 'too_large';

export type RuleEdit =
  | { readonly ok: true; readonly op: Op | null }
  | { readonly ok: false; readonly refusal: NumberRefusal };

/** How a number entry is constrained. */
export interface NumberRule {
  readonly whole: boolean;
  readonly nonNegative: boolean;
}

/** A raw entry as a number under `rule`, or why not. The caller handles the
 * empty entry first — `Number('')` is 0, and an empty field means "clear". */
export function parseNumber(raw: string, rule: NumberRule): number | NumberRefusal {
  // `-0` is a negative zero the serializer writes as `-0`, which a u64 key
  // refuses — the whole file would stop parsing. It means 0.
  const parsed = Number(raw.trim());
  const n = Object.is(parsed, -0) ? 0 : parsed;
  if (Number.isNaN(n)) {
    return 'not_a_number';
  }
  if (!Number.isFinite(n) || (rule.whole && !Number.isSafeInteger(Math.trunc(n)))) {
    return 'too_large';
  }
  if (rule.whole && !Number.isInteger(n)) {
    return 'not_whole';
  }
  return rule.nonNegative && n < 0 ? 'negative' : n;
}

/** A wire value as the text an input shows: numbers / booleans spelled out, a
 * string verbatim, anything else (absent, a container) empty. */
export function shownScalar(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return typeof value === 'string' ? value : '';
}

/** One node's range keys, placeholder and example, as authored. */
export interface ValueRules {
  readonly ranges: Readonly<Record<RangeKey, string>>;
  readonly placeholder: string;
  /** The authored example (`undefined` when none) — kept raw so it is written
   * back only when the user changes it. */
  readonly example: unknown;
}

export function readValueRules(defsText: string, keysPath: readonly string[]): ValueRules {
  const schema = readSchemaNode(defsText, keysPath);
  const ranges = Object.fromEntries(
    [...COUNT_KEYS, ...BOUND_KEYS].map((key) => [key, shownScalar(own(schema, key))]),
  ) as Record<RangeKey, string>;
  const placeholder = own(schema, 'placeholder');
  return {
    ranges,
    placeholder: typeof placeholder === 'string' ? placeholder : '',
    example: own(schema, 'example'),
  };
}

function isCountKey(key: RangeKey): boolean {
  return (COUNT_KEYS as readonly string[]).includes(key);
}

/** Set / clear one range key. `current` is the shown value; an entry naming the
 * same number (`10.0` over `10`) authors nothing. */
export function rangeOp(
  keysPath: readonly string[],
  key: RangeKey,
  current: string,
  raw: string,
): RuleEdit {
  const keys = [...keysPath, key];
  if (raw.trim() === '') {
    return { ok: true, op: current === '' ? null : { op: 'removeKey', keys } };
  }
  const count = isCountKey(key);
  const n = parseNumber(raw, { whole: count, nonNegative: count });
  if (typeof n === 'string') {
    return { ok: false, refusal: n };
  }
  return { ok: true, op: String(n) === current ? null : { op: 'setScalar', keys, value: n } };
}

/** Whether a lower bound sits above its upper bound — every value then warns.
 * Unset or unreadable bounds never conflict. */
export function rangeConflict(min: string, max: string): boolean {
  const low = Number(min);
  const high = Number(max);
  return min !== '' && max !== '' && Number.isFinite(low) && Number.isFinite(high) && low > high;
}

/** Set / clear the placeholder (verbatim — spaces are what gets drawn). */
export function placeholderOp(
  keysPath: readonly string[],
  current: string,
  raw: string,
): Op | null {
  if (raw === current) {
    return null;
  }
  const keys = [...keysPath, 'placeholder'];
  return raw === '' ? { op: 'removeKey', keys } : { op: 'setScalar', keys, value: raw };
}

/** Whether the authored example is something a typed field can show and edit:
 * absent, or a scalar. A container example is legal wire the field cannot
 * represent, so it is shown verbatim and left alone. */
export function exampleEditable(example: unknown): boolean {
  return example === undefined || ['string', 'number', 'boolean'].includes(typeof example);
}

/** Set / clear the generation example, typed by the field's base type: a
 * number for `number`, a whole number for `integer`, `true` / `false` for a
 * boolean (the entry comes from a select), the text otherwise. */
export function exampleOp(
  keysPath: readonly string[],
  type: string,
  current: unknown,
  raw: string,
): RuleEdit {
  const keys = [...keysPath, 'example'];
  if (raw === '' || (type !== 'string' && raw.trim() === '')) {
    return { ok: true, op: current === undefined ? null : { op: 'removeKey', keys } };
  }
  let value: string | number | boolean = raw;
  if (type === 'number' || type === 'integer') {
    const n = parseNumber(raw, { whole: type === 'integer', nonNegative: false });
    if (typeof n === 'string') {
      return { ok: false, refusal: n };
    }
    value = n;
  } else if (type === 'boolean') {
    value = raw === 'true';
  }
  return { ok: true, op: Object.is(value, current) ? null : { op: 'setScalar', keys, value } };
}
