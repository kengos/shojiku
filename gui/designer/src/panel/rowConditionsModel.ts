// The READ side of a table's per-row conditional styles
// (`row.conditionalStyles`): the raw entry list, the rule rows the panel
// renders, which of them is still open, and which value control a picked field
// earns. The op builders that
// edit the list live beside it in `rowConditionOps.ts`.
//
// The document is untrusted: a hostile entry still yields a row so the
// displayed indices stay true, and a hostile display string is truncated
// rather than dropped.

import type { ReadFn } from '@shojiku/designer-core';

/** How the value control renders for the picked field. */
export type ConditionValueForm = 'enum' | 'text' | 'boolean';

/** One conditional entry as the panel shows it. */
export interface RowConditionRow {
  /** `when.key` ('' when unset or not a string). */
  readonly key: string;
  /** `when.equals`'s display string ('' when absent — the boolean form). */
  readonly equals: string;
  /** Whether `equals` is authored at all (absent = read the field as a bool). */
  readonly hasEquals: boolean;
  /** Whether `equals` is authored as a BOOLEAN literal (`true`/`false`) — the
   * yes/no control's input, which a quoted `"false"` must not light up. */
  readonly boolEquals: boolean;
  /** `style.textAlign` ('' when unset). */
  readonly textAlign: string;
  /** `style.verticalAlign` ('' when unset). */
  readonly verticalAlign: string;
  /** `style.fontWeight` ('' when unset). Kept as the RAW value rather than a
   * `bold` boolean: the Designer authors `normal` explicitly when you un-tick
   * Bold over a band that is bold, and a boolean cannot tell that apart from
   * an unset weight — which is how the collapsed strip came to call such a
   * rule empty. */
  readonly fontWeight: string;
  /** `style.backgroundColor` ('' when unset). */
  readonly backgroundColor: string;
  /** `style.color` ('' when unset). */
  readonly color: string;
  /** `style.fontStyle` ('' when unset) — RAW, for the same reason as
   * `fontWeight`: un-ticking an inherited italic authors `normal`. */
  readonly fontStyle: string;
  /** `style.fontSize` as text ('' when unset; a bare number as its numeral). */
  readonly fontSize: string;
  /** `style.fontFamily` ('' when unset). */
  readonly fontFamily: string;
  /** How many `styleNames` the entry carries — reported on the collapsed row,
   * whose chips otherwise say nothing about them. */
  readonly styleNameCount: number;
  /** How many keys the entry's `style` map carries IN TOTAL — including the
   * `Style` properties the rule editor does not render. Whether a rule adds
   * anything is a question about the wire, not about the fields the editor
   * happens to render, so the "adds nothing" sentence is decided from this
   * rather than from the chips. */
  readonly styleKeyCount: number;
}

/** Longest display string a hostile document can put in a row. */
const MAX_DISPLAY = 80;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > MAX_DISPLAY ? `${value.slice(0, MAX_DISPLAY)}…` : value;
}

/** A scalar `equals` as the input shows it; containers read as unset (the
 * engine rejects them at parse, so there is nothing to edit). */
function displayScalar(value: unknown): string {
  if (typeof value === 'string') {
    return text(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** The raw `row.conditionalStyles` entries of the table at `tablePath` — the
 * array every op builder rewrites. `[]` when the table has none, is malformed,
 * or cannot be read. */
export function readRawEntries(read: ReadFn, tablePath: string): readonly unknown[] {
  let node: unknown;
  try {
    node = read(tablePath);
  } catch {
    return [];
  }
  const entries = record(record(node)?.row)?.conditionalStyles;
  return Array.isArray(entries) ? entries : [];
}

/** The rule rows for the panel. A malformed entry still yields a row so the
 * displayed indices match the document's. */
export function readRowConditions(entries: readonly unknown[]): readonly RowConditionRow[] {
  return entries.map((entry) => {
    const rule = record(entry);
    const when = record(rule?.when);
    const style = record(rule?.style);
    const names = rule?.styleNames;
    return {
      key: text(when?.key),
      equals: displayScalar(when?.equals),
      hasEquals: when !== undefined && when.equals !== undefined && when.equals !== null,
      boolEquals: typeof when?.equals === 'boolean',
      textAlign: text(style?.textAlign),
      verticalAlign: text(style?.verticalAlign),
      fontWeight: text(style?.fontWeight),
      backgroundColor: text(style?.backgroundColor),
      color: text(style?.color),
      fontStyle: text(style?.fontStyle),
      fontSize:
        typeof style?.fontSize === 'number' ? String(style.fontSize) : text(style?.fontSize),
      fontFamily: text(style?.fontFamily),
      styleNameCount: Array.isArray(names) ? names.length : 0,
      styleKeyCount: style === undefined ? 0 : Object.keys(style).length,
    };
  });
}

/** The open rule and its index — `null` when none is open, or when the open
 * index no longer names a rule (an undo took it away), which shows the list. */
export function openedRule<R>(
  rules: readonly R[],
  index: number | null,
): { readonly rule: R; readonly index: number } | null {
  if (index === null || index >= rules.length) {
    return null;
  }
  return { rule: rules[index], index };
}

/** Whether repointing at a new field must CLEAR the authored `equals`.
 *
 * Shared by both presence surfaces (a table row condition and an item's
 * `visible:`), because the failure is the same on each: an `equals` the new
 * field's control cannot DISPLAY is an invisible disagreement between the
 * panel and the wire.
 *
 * - a boolean field renders yes/no, which can show a BOOLEAN `equals` (a
 *   repoint between two yes/no fields keeps the answer the user picked) but
 *   not any other value, which would still override the boolean read;
 * - an enum-form field renders its values as chips, none pressed when no value
 *   matches — the screen then says unset while the file says otherwise;
 * - free entry shows whatever is there, so nothing goes stale.
 */
export function equalsGoesStale(
  hasEquals: boolean,
  equals: string,
  newFieldType: string,
  newFieldEnums: readonly string[],
  boolEquals = false,
): boolean {
  if (!hasEquals) {
    return false;
  }
  switch (valueFormFor(newFieldType, newFieldEnums)) {
    case 'boolean':
      return !boolEquals;
    case 'enum':
      return !newFieldEnums.includes(equals);
    default:
      return false;
  }
}

/** Which value control the picked field gets: its declared `enum` when it has
 * one, yes/no for a boolean (yes = no `equals`, no = `equals: false`), else
 * free entry (`ValueControl`). */
export function valueFormFor(type: string, enumValues: readonly string[]): ConditionValueForm {
  if (enumValues.length > 0) {
    return 'enum';
  }
  return type === 'boolean' ? 'boolean' : 'text';
}
