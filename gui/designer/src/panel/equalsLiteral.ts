// The typed literal a presence predicate's `equals` carries — ONE home for the
// three surfaces that author one (a table row-condition rule, an item's
// `visible:`, a form mark's `data:`), which used to carry a copy each.
//
// The engine's predicate is type-strict (`"2"` never equals `2`, `"false"` never
// equals `false`), so the literal follows the FIELD's type, not the text the
// control produced: digits for a numeric field become a number, `true`/`false`
// for a boolean field become the boolean, anything else stays the text. An
// unparseable or non-finite numeric entry stays a string — the engine then warns
// about the mismatch, which beats authoring `NaN`.

import type { ScalarValue } from '@shojiku/designer-core';

/** The display types that mean "the params value is a NUMBER" (the engine's
 * `(type, format)` map collapses currency/percentage/quantity onto number). */
const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  'number',
  'currency',
  'percentage',
  'quantity',
]);

export function equalsLiteral(value: string, fieldType: string): ScalarValue {
  if (fieldType === 'boolean' && (value === 'true' || value === 'false')) {
    return value === 'true';
  }
  if (!NUMERIC_TYPES.has(fieldType)) {
    return value;
  }
  const parsed = Number(value.trim());
  return value.trim() !== '' && Number.isFinite(parsed) ? parsed : value;
}
