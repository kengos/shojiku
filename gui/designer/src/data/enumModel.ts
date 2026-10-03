// The CHOICES (`enum`) of a definitions field as the data-item editor edits
// them: the member list read in full (not the palette's capped display list —
// this list is written back), each member's value and FORM kept, and the op
// that writes the whole list back (the member edits over it: `enumEdits.ts`).
//
// Why the whole list: the definitions host takes ONE op per action, and the
// sequence ops (`moveItem` / `insertItem` / `removeItem`) address a sequence by
// the structural path grammar, which cannot spell a data name such as `取引先`.
// So every choice edit is a root-addressed `putValue` of the list (a comment
// INSIDE the list does not survive an edit of that list; everything outside it
// does), and emptying the list REMOVES the key — `enum: []` would make every
// value warn. `putValue` refuses a value over designer-core's snippet budget,
// which therefore bounds what this editor can write, alongside the engine's own
// member cap. A list the editor could not write back exactly as it found it
// (over that bound, a container member, a malformed pair, a number spelled
// other than it would be written — `enumSource.ts`) is read as READ-ONLY rather
// than rewritten.

import { MAX_SNIPPET_NODES, type Op, type SnippetValue } from '@shojiku/designer-core';
import { enumSpelledCanonically } from './enumSource';
import { own, readSchemaNode, record } from './schemaNode';
import { type NumberRefusal, parseNumber } from './valueRules';

/** The engine's member cap (`MAX_ENUM_VALUES`, engine/core definitions schema;
 * pinned by a drift test). */
export const MAX_ENUM_VALUES = 256;

export type EnumValue = string | number | boolean;

/** One member: its value, its label, and whether it is written in the labeled
 * FORM (`{ value, label }`) — kept even when the label is empty, since the
 * engine treats that form as labeled. */
export interface EnumRow {
  readonly value: EnumValue;
  readonly label: string;
  readonly labeled: boolean;
}

export type EnumRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'rows'; readonly rows: readonly EnumRow[] }
  | {
      readonly kind: 'readonly';
      readonly reason: 'shape' | 'too_long';
      /** The members the list holds (0 for a non-list) — what removing it
       * would remove. */
      readonly count: number;
    };

export type EnumRefusal = NumberRefusal | 'empty' | 'duplicate' | 'full';

export type EnumEdit =
  | { readonly ok: true; readonly op: Op | null }
  | { readonly ok: false; readonly refusal: EnumRefusal };

function scalar(value: unknown): value is EnumValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function member(raw: unknown): EnumRow | undefined {
  if (scalar(raw)) {
    return { value: raw, label: '', labeled: false };
  }
  const pair = record(raw);
  const keys = pair === undefined ? [] : Object.keys(pair);
  const value = own(pair, 'value');
  const label = own(pair, 'label');
  const exact = keys.length === 2 && keys.includes('value') && keys.includes('label');
  return exact && scalar(value) && typeof label === 'string'
    ? { value, label, labeled: true }
    : undefined;
}

/** The longest lists one op can write: all bare, and all labeled (what the
 * editor's refusal and read-only note quote). */
export const ENUM_MAX_BARE = Math.min(MAX_ENUM_VALUES, MAX_SNIPPET_NODES - 1);
export const ENUM_MAX_LABELED = Math.min(MAX_ENUM_VALUES, Math.floor((MAX_SNIPPET_NODES - 1) / 3));

/** The nodes a written list costs in designer-core's snippet budget. */
export function snippetNodes(rows: readonly EnumRow[]): number {
  return rows.reduce((sum, row) => sum + (row.labeled ? 3 : 1), 1);
}

/** Whether one op can write `rows` and the engine accept them. */
export function fits(rows: readonly EnumRow[]): boolean {
  return rows.length <= MAX_ENUM_VALUES && snippetNodes(rows) <= MAX_SNIPPET_NODES;
}

export function readEnum(defsText: string, keysPath: readonly string[]): EnumRead {
  const raw = own(readSchemaNode(defsText, keysPath), 'enum');
  if (raw === undefined) {
    return { kind: 'absent' };
  }
  if (!Array.isArray(raw)) {
    return { kind: 'readonly', reason: 'shape', count: 0 };
  }
  const count = raw.length;
  const rows: EnumRow[] = [];
  for (const entry of raw.slice(0, MAX_ENUM_VALUES + 1)) {
    const row = member(entry);
    if (row === undefined) {
      return { kind: 'readonly', reason: 'shape', count };
    }
    rows.push(row);
  }
  if (!fits(rows)) {
    return { kind: 'readonly', reason: 'too_long', count };
  }
  // A number spelled other than as written back (`2.0`, `1e3`) would change
  // when ANOTHER member is edited (`enumSource.ts`).
  return enumSpelledCanonically(defsText, keysPath)
    ? { kind: 'rows', rows }
    : { kind: 'readonly', reason: 'shape', count };
}

/** A raw entry as a member value of a field of base type `type`: verbatim text
 * for a string field, a number / whole number for number / integer, `true` /
 * `false` for a boolean (from a select). */
export function parseEnumValue(
  type: string,
  raw: string,
):
  | { readonly ok: true; readonly value: EnumValue }
  | { readonly ok: false; readonly refusal: EnumRefusal } {
  if (raw.trim() === '') {
    return { ok: false, refusal: 'empty' };
  }
  if (type === 'number' || type === 'integer') {
    const n = parseNumber(raw, { whole: type === 'integer', nonNegative: false });
    return typeof n === 'string' ? { ok: false, refusal: n } : { ok: true, value: n };
  }
  return { ok: true, value: type === 'boolean' ? raw === 'true' : raw };
}

/** The op writing `rows` (`removeKey` once empty), or `full`. */
export function writeRows(keysPath: readonly string[], rows: readonly EnumRow[]): EnumEdit {
  const keys = [...keysPath, 'enum'];
  if (rows.length === 0) {
    return { ok: true, op: { op: 'removeKey', keys } };
  }
  if (!fits(rows)) {
    return { ok: false, refusal: 'full' };
  }
  return { ok: true, op: putRows(keysPath, rows) };
}

/** The `putValue` writing `rows`, each member in its form. */
export function putRows(keysPath: readonly string[], rows: readonly EnumRow[]): Op {
  const value: SnippetValue[] = rows.map((row) =>
    row.labeled ? { value: row.value, label: row.label } : row.value,
  );
  return { op: 'putValue', keys: [...keysPath, 'enum'], value };
}
