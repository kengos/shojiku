// The typesetting keys a text-drawing item takes — vertical writing
// (`writingMode`, `textOrientation`, `textCombineUpright`) and the line-breaking
// family (`lineBreak`, `textSpacingTrim`, `hangingPunctuation`) — as data: which
// types read which key, which options an engine declares, and what a pick
// authors. Framework-free; the section component renders over it.
//
// Every row is read from the layout code that consults the resolved value, not
// from the reference prose (`engine/layout/src/engine/`): a plain text block
// reads all six (`text.rs` → `vblock.rs`, `block/lines.rs`); a page number in a
// band reads all six (`band.rs`); a table's cells inherit the table's style and
// read all six (`table/rows.rs`, `rows/measure.rs`); a container reads none
// itself and hands all six to what it holds (`container.rs`); a list reads only
// the vertical three — its entries never wrap, its trim is forced to
// `space_all` and nothing hangs (`list.rs`, `list/vertical.rs`). Horizontal
// `spans` never hang punctuation (`wrap/rich.rs` hard-codes none), so a
// spans-carrying text drops that key while it is horizontal.

import type { Op } from '@shojiku/designer-core';
import { hasCapability } from './itemPanelProps';

export const TYPESETTING_KEYS = [
  'writingMode',
  'textOrientation',
  'textCombineUpright',
  'lineBreak',
  'textSpacingTrim',
  'hangingPunctuation',
] as const;
export type TypesettingKey = (typeof TYPESETTING_KEYS)[number];

/** The keys consulted only in a VERTICAL line. Shown while the effective
 * writing mode is vertical, or while the item authors one itself (so a value
 * left behind by a switch back to horizontal can still be cleared). */
export const VERTICAL_ONLY_KEYS: ReadonlySet<TypesettingKey> = new Set([
  'textOrientation',
  'textCombineUpright',
]);

const VERTICAL_KEYS: readonly TypesettingKey[] = [
  'writingMode',
  'textOrientation',
  'textCombineUpright',
];

/** Which keys each type's engine reads (see the header for the citations). */
const KEYS_BY_TYPE: Readonly<Record<string, readonly TypesettingKey[]>> = {
  text: TYPESETTING_KEYS,
  page_number: TYPESETTING_KEYS,
  table: TYPESETTING_KEYS,
  container: TYPESETTING_KEYS,
  list: VERTICAL_KEYS,
};

/** The wire's vertical writing mode (`WritingMode::VerticalRl`). */
export const VERTICAL_RL = 'vertical_rl';

/** The `textCombineUpright` tokens the select works in: the two keywords as
 * themselves and the map `{ digits: N }` as `digitsN` (N in 2..=4, the range
 * the engine parses — `engine/core/src/style/writing.rs`). */
const COMBINE_DIGITS = ['digits2', 'digits3', 'digits4'] as const;

/** Every option the wire takes, per key, in the engine's declaration order
 * (`engine/core/src/style/{writing,enums}.rs`). */
const OPTIONS: Readonly<Record<TypesettingKey, readonly string[]>> = {
  writingMode: ['horizontal_tb', VERTICAL_RL],
  textOrientation: ['mixed', 'upright'],
  textCombineUpright: ['none', ...COMBINE_DIGITS, 'all'],
  lineBreak: ['normal', 'strict', 'loose', 'anywhere'],
  textSpacingTrim: ['space_all', 'normal', 'trim_start'],
  hangingPunctuation: ['none', 'allow_end', 'force_end'],
};

/** The capability that declares each key; older engines parse-reject it. */
const KEY_CAPABILITY: Readonly<Record<TypesettingKey, string>> = {
  writingMode: 'style.writingMode',
  textOrientation: 'style.textOrientation',
  textCombineUpright: 'style.textCombineUpright',
  lineBreak: 'style.lineBreak',
  textSpacingTrim: 'style.textSpacingTrim',
  hangingPunctuation: 'style.hangingPunctuation',
};

/** Options a later capability added on top of its key's own. */
const OPTION_CAPABILITY: Readonly<Record<string, string>> = {
  'lineBreak.strict': 'style.lineBreak.strict_loose',
  'lineBreak.loose': 'style.lineBreak.strict_loose',
  'textCombineUpright.all': 'style.textCombineUpright.all',
};

/** The surfaces past a plain text block — a list, a page number, a table's
 * cells, `spans` — draw vertically only on an engine declaring it (older ones
 * warn `vertical_text_unsupported` and stay horizontal). */
const SURFACES_CAPABILITY = 'style.writingMode.surfaces';

/** Where the item's text comes from, as far as the key table cares. */
export interface TypesettingSubject {
  readonly type: string;
  readonly hasSpans: boolean;
  /** The cascade-effective writing mode is vertical. */
  readonly vertical: boolean;
}

function plainText(subject: TypesettingSubject): boolean {
  return subject.type === 'text' && !subject.hasSpans;
}

function keyOffered(
  subject: TypesettingSubject,
  key: TypesettingKey,
  capabilities: readonly string[] | undefined,
): boolean {
  if (!hasCapability(capabilities, KEY_CAPABILITY[key])) {
    return false;
  }
  if (key === 'hangingPunctuation' && subject.hasSpans && !subject.vertical) {
    return false;
  }
  const verticalFamily = VERTICAL_KEYS.includes(key);
  if (verticalFamily && !plainText(subject) && subject.type !== 'container') {
    // A list and spans also need `.all` for tate-chu-yoko: that key is what
    // marks it honoured per span and in a vertical list.
    const extra =
      key === 'textCombineUpright' && (subject.type === 'list' || subject.hasSpans)
        ? hasCapability(capabilities, 'style.textCombineUpright.all')
        : true;
    return extra && hasCapability(capabilities, SURFACES_CAPABILITY);
  }
  return true;
}

/** The keys the type's engine reads AND this engine declares, in order. A
 * vertical-only key is still listed here; the section decides its visibility
 * (`VERTICAL_ONLY_KEYS`) from the effective mode and the item's own value. */
export function typesettingKeys(
  subject: TypesettingSubject,
  capabilities: readonly string[] | undefined,
): readonly TypesettingKey[] {
  const keys = Object.hasOwn(KEYS_BY_TYPE, subject.type) ? KEYS_BY_TYPE[subject.type] : [];
  return keys.filter((key) => keyOffered(subject, key, capabilities));
}

/** The key's options this engine can take. */
export function typesettingOptions(
  key: TypesettingKey,
  capabilities: readonly string[] | undefined,
): readonly string[] {
  return OPTIONS[key].filter((option) => {
    const gate = OPTION_CAPABILITY[`${key}.${option}`];
    return gate === undefined || hasCapability(capabilities, gate);
  });
}

function plainMap(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The token for a `textCombineUpright` the item carries in a shape the engine
 * cannot parse. */
export const UNREADABLE_COMBINE = 'invalid';

/** A `textCombineUpright` wire value as the select's token: a keyword as
 * itself, `{ digits: N }` as `digitsN` (an integer outside 2..=4 keeps its
 * token, so the select shows it as itself). Absent (`undefined`/`null`) reads
 * as `''`, unset. Any OTHER present shape the engine cannot parse — extra keys,
 * a non-integer, a list, a bare number — reads as `UNREADABLE_COMBINE`, never
 * as unset: the item does carry a value, and the document is broken until it
 * goes, so the select must show it (it stays visible) and its 「not set」 row
 * must be able to remove it. Read as unset, it would be hidden while horizontal
 * and, once shown, impossible to clear — a native select fires no change for
 * the option it already shows. */
export function combineToken(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  const map = plainMap(value);
  const keys = map === null ? [] : Object.keys(map);
  const digits = map?.digits;
  return keys.length === 1 && keys[0] === 'digits' && Number.isInteger(digits)
    ? `digits${digits as number}`
    : UNREADABLE_COMBINE;
}

/** What a pick authors on the item at `path`. `''` removes the key (the
 * select always lists its 「not set」 row, but picking it while nothing is set
 * fires no change, and an unchanged pick is `null` — so a removal only ever
 * targets a key the item carries); a `digitsN` token becomes the
 * `{ digits: N }` map; everything else is the wire keyword verbatim. Returns
 * `null` for an unchanged pick. */
export function typesettingOp(
  path: string,
  key: TypesettingKey,
  own: string,
  next: string,
): Op | null {
  if (next === own) {
    return null;
  }
  const keys = ['style', key];
  if (next === '') {
    return { op: 'removeKey', path, keys };
  }
  const digits = /^digits([0-9])$/.exec(next);
  const value =
    key === 'textCombineUpright' && digits !== null ? { digits: Number(digits[1]) } : next;
  // `putValue` replaces whatever node is there, so switching between the map
  // and a keyword is one op on the one key.
  return { op: 'putValue', path, keys, value };
}
