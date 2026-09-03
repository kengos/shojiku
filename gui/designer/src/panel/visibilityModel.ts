// The READ side of an item's `visible:` presence binding — the row the panel
// renders. The op builders that edit it live beside this in
// `visibilityOps.ts`.
//
// The value control a picked field earns is the SAME question a table row
// condition asks, so `valueFormFor` is imported rather than restated: one
// truth about which field type gets a select, free entry, or no control.
//
// The document is untrusted — an externally-authored `visible:` may carry a
// non-string key or a container `equals` — so every field degrades to a
// displayable string rather than throwing, and a hostile display string is
// truncated rather than dropped.

import type { ReadFn } from '@shojiku/designer-core';

export { valueFormFor } from './rowConditionsModel';

/** An item's `visible:` binding as the panel shows it. */
export interface VisibleRow {
  /** `visible.key` ('' when unset or not a string). */
  readonly key: string;
  /** `visible.equals`'s display string ('' when absent — the boolean form). */
  readonly equals: string;
  /** Whether `equals` is authored at all (absent = read the field as a bool). */
  readonly hasEquals: boolean;
  /** Whether `collapse: true` is authored (take the item out of layout). */
  readonly collapse: boolean;
  /** Whether `scope: document` is authored. The panel does not edit it — the
   * scope escape is an authoring-level choice — so the row REPORTS it rather
   * than hiding that the document says something the panel cannot show. */
  readonly documentScope: boolean;
  /** Whether `visible.scope` is present AT ALL, whatever its value — what a
   * repoint that CLEARS the scope has to be told, since `removeKey` fails on
   * an absent key and one failing op refuses the batch. `documentScope` cannot
   * stand in: it is false both for an absent key and for an authored
   * `element`. */
  readonly hasScope: boolean;
}

/** Longest display string a hostile document can put in the row. */
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

/** Reads an item's `visible:` binding, or `null` when it authors none.
 *
 * A binding that exists but is not a map still yields `null`: there is no
 * row to edit, and the engine's parse error is the honest report.
 */
export function readVisible(read: ReadFn, path: string): VisibleRow | null {
  const item = record(read(path));
  const visible = record(item?.visible);
  if (visible === undefined) {
    return null;
  }
  return {
    key: text(visible.key),
    equals: displayScalar(visible.equals),
    hasEquals: visible.equals !== undefined && visible.equals !== null,
    collapse: visible.collapse === true,
    documentScope: visible.scope === 'document',
    hasScope: visible.scope !== undefined,
  };
}
