// The READ side of a table's per-row conditional styles
// (`row.conditionalStyles`): the raw entry list, the rule rows the panel
// renders, and which value control a picked field earns. The op builders that
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
  /** `style.textAlign` ('' when unset). */
  readonly textAlign: string;
  /** Whether `style.fontWeight` is `bold`. */
  readonly bold: boolean;
  /** `style.backgroundColor` ('' when unset). */
  readonly backgroundColor: string;
  /** `style.color` ('' when unset). */
  readonly color: string;
  /** How many `styleNames` the entry carries — the editor does not edit them,
   * so the row reports them instead of hiding them. */
  readonly styleNameCount: number;
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
      textAlign: text(style?.textAlign),
      bold: style?.fontWeight === 'bold',
      backgroundColor: text(style?.backgroundColor),
      color: text(style?.color),
      styleNameCount: Array.isArray(names) ? names.length : 0,
    };
  });
}

/** Which value control the picked field gets: its declared `enum` when it has
 * one, no control at all for a boolean (the wire then omits `equals`), else
 * free entry. */
export function valueFormFor(type: string, enumValues: readonly string[]): ConditionValueForm {
  if (enumValues.length > 0) {
    return 'enum';
  }
  return type === 'boolean' ? 'boolean' : 'text';
}
