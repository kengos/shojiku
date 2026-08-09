// The WRITE side of an item's `visible:` presence binding.
//
// `visible:` is a MAP on the item, not a sequence, so every edit is a leaf
// `setScalar`/`removeKey` under it — no index arithmetic and no whole-list
// rewrite. Adding the binding is the one exception: nothing exists to write
// into, so `putValue` seeds the map.
//
// Two rules the wire enforces and this file honours: unset never serializes
// (clearing `collapse` REMOVES the key rather than writing `false`), and a
// repoint reconciles a stale `equals` in the same batch — a boolean-form
// field renders no value control, so a kept `equals` would be invisible AND
// still override the boolean read.

import type { Op, ScalarValue, SnippetValue } from '@shojiku/designer-core';
import { equalsGoesStale } from './rowConditionsModel';

/** The display types that mean "the params value is a NUMBER" (the engine's
 * `(type, format)` map collapses currency/percentage/quantity onto number).
 * An `equals` against one of these must be authored as a number literal:
 * the engine's predicate is type-strict, so a quoted `"2"` would never match
 * a numeric 2 — and the user typed digits, not a string. */
const NUMERIC_TYPES = new Set(['number', 'currency', 'percentage', 'quantity']);

/** Adds a `visible:` binding with no field picked yet. The empty key is
 * HONEST — the engine reports it until a field is chosen — and matches how
 * the row-conditions editor seeds a blank rule. */
export function addVisibleOp(path: string): Op {
  const blank: SnippetValue = { key: '' };
  return { op: 'putValue', path, keys: ['visible'], value: blank };
}

/** Drops the whole binding, so the item draws unconditionally again. */
export function removeVisibleOp(path: string): Op {
  return { op: 'removeKey', path, keys: ['visible'] };
}

/** Repoints the binding at another field, reconciling a stale `equals` AND
 * the data scope into the SAME batch so it lands as one undo step.
 *
 * `documentScoped` is the scope the picked field was OFFERED at, not a
 * separate control: inside a `repeat` cell the key resolves against the bound
 * element by default, so picking a TOP-LEVEL field without writing
 * `scope: document` authors a binding that silently resolves to nothing —
 * the item then vanishes with no diagnostic (no definitions) or reports an
 * undeclared key (with them). `undefined` means the caller offers no scope
 * choice and the authored `scope:` is left exactly as the file has it.
 */
export function repointVisibleOps(
  path: string,
  key: string,
  newFieldType: string,
  newFieldEnums: readonly string[],
  hasEquals: boolean,
  equals: string,
  documentScoped?: boolean,
): readonly Op[] {
  const ops: Op[] = [{ op: 'setScalar', path, keys: ['visible', 'key'], value: key }];
  if (documentScoped === true) {
    ops.push({ op: 'setScalar', path, keys: ['visible', 'scope'], value: 'document' });
  } else if (documentScoped === false) {
    // Element is the default, and unset never serializes.
    ops.push({ op: 'removeKey', path, keys: ['visible', 'scope'] });
  }
  if (equalsGoesStale(hasEquals, equals, newFieldType, newFieldEnums)) {
    ops.push({ op: 'removeKey', path, keys: ['visible', 'equals'] });
  }
  return ops;
}

/** Sets (or, with `null`/`''`, removes) the binding's `equals` — removing it
 * is what makes the binding the boolean form. */
export function setVisibleEqualsOp(path: string, value: string | null, fieldType = ''): Op {
  if (value === null || value === '') {
    return { op: 'removeKey', path, keys: ['visible', 'equals'] };
  }
  return { op: 'setScalar', path, keys: ['visible', 'equals'], value: literal(value, fieldType) };
}

/** Turns `collapse` on, or OFF by removing the key. Writing `collapse: false`
 * would round-trip a default the engine never serializes, so the off state is
 * the key's absence. */
export function setCollapseOp(path: string, collapse: boolean): Op {
  return collapse
    ? { op: 'setScalar', path, keys: ['visible', 'collapse'], value: true }
    : { op: 'removeKey', path, keys: ['visible', 'collapse'] };
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
