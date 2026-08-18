// The WRITE side of a table's per-row conditional styles
// (`row.conditionalStyles`): the op builders that edit the rule list read by
// `rowConditionsModel.ts`.
//
// Two things shape this file. (1) The wire is a SEQUENCE, so an edit
// addresses ONE entry through the structural path's `[n]` index and touches
// only its own leaf (`setScalar`/`removeKey` under it) — a whole-list rewrite
// would re-serialize the neighbouring rules too, and a rule the user never
// opened must not move in the diff. Adding the FIRST rule is the exception:
// nothing exists to index into, so it seeds the list (and the `row:` map)
// with `putValue`. (2) The document is untrusted: an out-of-range index
// refuses rather than writing.

import type { Op, ScalarValue, SnippetValue } from '@shojiku/designer-core';
import { equalsGoesStale } from './rowConditionsModel';

/** The display types that mean "the params value is a NUMBER" (the engine's
 * `(type, format)` map collapses currency/percentage/quantity onto number).
 * An `equals` against one of these must be authored as a number literal:
 * the engine's predicate is type-strict, so a quoted `"2"` would never match
 * a numeric 2 — and the user typed digits, not a string. */
const NUMERIC_TYPES = new Set(['number', 'currency', 'percentage', 'quantity']);

/** The structural path of one entry — the op layer addresses a sequence
 * element by `[n]` in the PATH (the map-key `keys` cannot), which is what
 * lets an edit touch one rule's leaf and leave its neighbours byte-exact. */
function entryPath(tablePath: string, index: number): string {
  return `${tablePath}.row.conditionalStyles[${index}]`;
}

/** Guards an entry index against the list the caller read. */
function inRange(entries: readonly unknown[], index: number): boolean {
  return index >= 0 && index < entries.length;
}

/** Appends a blank rule. Like the blank column the columns editor adds, the
 * empty key is HONEST: the engine reports it until a field is picked. The
 * FIRST rule needs `putValue` (it auto-creates the missing `row:` map and the
 * list); later ones splice into the existing sequence. */
export function addRuleOp(tablePath: string, entries: readonly unknown[]): Op {
  const blank: SnippetValue = { when: { key: '' } };
  if (entries.length === 0) {
    return {
      op: 'putValue',
      path: tablePath,
      keys: ['row', 'conditionalStyles'],
      value: [blank],
    };
  }
  return {
    op: 'insertItem',
    path: `${tablePath}.row.conditionalStyles`,
    index: entries.length,
    value: blank,
  };
}

/** Removes one rule; removing the LAST one drops the whole key so the
 * document never keeps an empty list (the op layer prunes the `row:` map
 * too when nothing else is in it). */
export function removeRuleOp(
  tablePath: string,
  entries: readonly unknown[],
  index: number,
): Op | null {
  if (!inRange(entries, index)) {
    return null;
  }
  if (entries.length === 1) {
    return { op: 'removeKey', path: tablePath, keys: ['row', 'conditionalStyles'] };
  }
  return { op: 'removeItem', path: `${tablePath}.row.conditionalStyles`, index };
}

/** Repoints a rule at another field. */
export function setRuleKeyOp(
  tablePath: string,
  entries: readonly unknown[],
  index: number,
  key: string,
): Op | null {
  if (!inRange(entries, index)) {
    return null;
  }
  return { op: 'setScalar', path: entryPath(tablePath, index), keys: ['when', 'key'], value: key };
}

/** Repoints a rule at another field, reconciling a stale `equals`: a
 * boolean-form field renders no value control, so a kept `equals` would be
 * invisible AND still override the boolean read on the wire. Returns the op
 * batch to apply transactionally (one undo step); `[]` for an out-of-range
 * index. */
export function repointRuleOps(
  tablePath: string,
  entries: readonly unknown[],
  index: number,
  key: string,
  newFieldType: string,
  newFieldEnums: readonly string[],
  hasEquals: boolean,
  equals: string,
): readonly Op[] {
  const keyOp = setRuleKeyOp(tablePath, entries, index, key);
  if (keyOp === null) {
    return [];
  }
  if (!equalsGoesStale(hasEquals, equals, newFieldType, newFieldEnums)) {
    return [keyOp];
  }
  // `keyOp` being non-null proves the index is in range, so the removal
  // needs no second guard.
  return [keyOp, { op: 'removeKey', path: entryPath(tablePath, index), keys: ['when', 'equals'] }];
}

/** Sets (or, with `null`/`''`, removes) a rule's `equals` — removing it is
 * what makes the entry the boolean form. */
export function setRuleEqualsOp(
  tablePath: string,
  entries: readonly unknown[],
  index: number,
  value: string | null,
  fieldType = '',
): Op | null {
  if (!inRange(entries, index)) {
    return null;
  }
  const path = entryPath(tablePath, index);
  if (value === null || value === '') {
    return { op: 'removeKey', path, keys: ['when', 'equals'] };
  }
  return { op: 'setScalar', path, keys: ['when', 'equals'], value: literal(value, fieldType) };
}

/** The typed literal an `equals` should carry: a number for a numeric field
 * (so the type-strict predicate can match), the text verbatim otherwise. An
 * unparseable or non-finite entry stays a string — the engine then warns
 * about the mismatch, which beats authoring `NaN`. */
function literal(value: string, fieldType: string): ScalarValue {
  if (!NUMERIC_TYPES.has(fieldType)) {
    return value;
  }
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : value;
}
