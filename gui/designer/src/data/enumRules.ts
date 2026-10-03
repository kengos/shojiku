// What the engine does with a field's choices, mirrored so the editor can say it
// BEFORE the author finds out from a diagnostic: whether the printed labels are
// used at all, and which members can never match a value of the field's type —
// plus which tree nodes the engine checks choices on at all (the rail's mark).
//
// Both mirror engine/core: `Schema::mapped` (the `(type, format)` → field-type
// table, definitions/schema.rs) and the `definitions_enum_labels_ignored`
// predicate (validate/schema.rs) — labels print only for a field whose mapped
// type is plain text. Drift-pinned against those sources.

import type { EnumRow, EnumValue } from './enumModel';
import { record } from './schemaNode';

/** The engine's field type for `(type, format)`, as `mapped()` decides it:
 * a number / integer is a number unless a currency / percentage / quantity
 * format refines it, a boolean is a boolean, and EVERYTHING ELSE — a string, an
 * object, an array, an unknown type — is text unless a string carries a date /
 * date-time / image format. An unknown format leaves the base type alone. */
export function engineFieldType(type: string, format: string): string {
  if (type === 'number' || type === 'integer') {
    return ['currency', 'percentage', 'quantity'].includes(format) ? format : 'number';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  if (type === 'string' && ['date', 'date-time', 'image'].includes(format)) {
    return format;
  }
  return 'string';
}

/** Whether the engine will ignore the labels (and warn): at least one member is
 * in the labeled form and the field does not print as plain text. */
export function labelsIgnored(type: string, format: string, rows: readonly EnumRow[]): boolean {
  return rows.some((row) => row.labeled) && engineFieldType(type, format) !== 'string';
}

/** Whether a member's value is not of the field's base type — the engine
 * compares values exactly, so such a member never matches a value of the
 * field's type (`1` never equals `"1"`). */
export function memberMismatch(type: string, value: EnumValue): boolean {
  if (type === 'number') {
    return typeof value !== 'number';
  }
  if (type === 'integer') {
    return !Number.isInteger(value);
  }
  if (type === 'boolean') {
    return typeof value !== 'boolean';
  }
  return typeof value !== 'string';
}

/** Whether a field declares a non-empty `enum`, or a list's element does. A
 * group's or a table's own `enum` is never checked by the engine, so it marks
 * nothing. Own properties only. */
export function declaresChoices(
  schema: Record<string, unknown>,
  kind: 'field' | 'group' | 'table' | 'list',
): boolean {
  if (kind !== 'field' && kind !== 'list') {
    return false;
  }
  const holder = kind === 'list' ? record(schema.items) : schema;
  const list = holder !== undefined && Object.hasOwn(holder, 'enum') ? holder.enum : undefined;
  return Array.isArray(list) && list.length > 0;
}
