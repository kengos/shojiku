// The value chips a row-condition rule offers for a text or number field: the
// DISTINCT values that field takes across the table's rows in the sample data,
// so a non-engineer picks `heading` instead of typing it. Suggestions, not a
// claim about what the rule will match — the panel never evaluates a predicate,
// and how many rows a rule hits is the canvas preview's answer.
//
// The params are untrusted: the walk is own-property only (`step`), the rows
// scanned and the chips returned are both capped, only strings and numbers
// become chips (the params are JSON, which carries no non-finite number), and a
// value too long to show whole is SKIPPED rather than truncated — a chip
// commits exactly the text it shows.

import { parseParams } from '../sample/model';
import { step } from './pickerModel';

/** Most chips one field offers — a pick list, not a data browser. */
export const MAX_VALUE_CHIPS = 12;
/** Most rows read to find them. */
const MAX_ROWS_SCANNED = 1000;
/** Longest value that becomes a chip. */
const MAX_CHIP_CHARS = 40;

/** The distinct sample values of `key` across the rows of the `scope` array,
 * in first-seen order. Empty when params do not parse, the scope is not an
 * array, or the field has no scalar values. */
export function sampleValues(paramsText: string, scope: string, key: string): readonly string[] {
  const rows = step(parseParams(paramsText), scope);
  if (!Array.isArray(rows)) {
    return [];
  }
  const out = new Set<string>();
  for (const row of rows.slice(0, MAX_ROWS_SCANNED)) {
    const text = chipText(step(row, key));
    if (text !== null) {
      out.add(text);
      if (out.size === MAX_VALUE_CHIPS) {
        break;
      }
    }
  }
  return [...out];
}

function chipText(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' && value !== '' && value.length <= MAX_CHIP_CHARS ? value : null;
}
