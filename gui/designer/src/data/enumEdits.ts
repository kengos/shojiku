// The member EDITS of a field's choices: append, change a value or a label,
// remove, move — each ONE op over the whole list (`writeRows` / `putRows` in
// `enumModel.ts`, which says why), typed by the field's base type, with the
// refusals the editor shows beside the entry.

import type { Op } from '@shojiku/designer-core';
import { moveOpFor } from '../tree/reorder';
import {
  type EnumEdit,
  type EnumRow,
  type EnumValue,
  parseEnumValue,
  putRows,
  writeRows,
} from './enumModel';

/** What a member edit addresses: the field's keys path, its base type and the
 * rows as read. */
export interface EnumTarget {
  readonly keysPath: readonly string[];
  readonly type: string;
  readonly rows: readonly EnumRow[];
}

function typedValue(target: EnumTarget, raw: string, except: number) {
  const parsed = parseEnumValue(target.type, raw);
  if (
    parsed.ok &&
    target.rows.some((row, index) => index !== except && row.value === parsed.value)
  ) {
    return { ok: false, refusal: 'duplicate' } as const;
  }
  return parsed;
}

function label(value: EnumValue, raw: string): EnumRow {
  return raw === '' ? { value, label: '', labeled: false } : { value, label: raw, labeled: true };
}

/** Append a member (an empty label writes the bare form). */
export function addRow(target: EnumTarget, rawValue: string, rawLabel: string): EnumEdit {
  const typed = typedValue(target, rawValue, -1);
  return typed.ok
    ? writeRows(target.keysPath, [...target.rows, label(typed.value, rawLabel)])
    : typed;
}

/** Change one member's value, keeping its label and form. */
export function setRowValue(target: EnumTarget, index: number, raw: string): EnumEdit {
  const typed = typedValue(target, raw, index);
  if (!typed.ok) {
    return typed;
  }
  const row = target.rows[index];
  if (row.value === typed.value) {
    return { ok: true, op: null };
  }
  return writeRows(
    target.keysPath,
    target.rows.map((each, at) => (at === index ? { ...row, value: typed.value } : each)),
  );
}

/** Change one member's label: empty writes the bare form, anything else the
 * labeled one. An unchanged entry authors nothing. */
export function setRowLabel(target: EnumTarget, index: number, raw: string): EnumEdit {
  const row = target.rows[index];
  if (raw === row.label) {
    return { ok: true, op: null };
  }
  return writeRows(
    target.keysPath,
    target.rows.map((each, at) => (at === index ? label(row.value, raw) : each)),
  );
}

export function removeRow(target: EnumTarget, index: number): EnumEdit {
  return writeRows(
    target.keysPath,
    target.rows.filter((_, at) => at !== index),
  );
}

/** Move the member at `from` into insertion slot `slot` (0..count) — the same
 * slot math the other list reorders use; `null` when it would not move. A
 * reorder never changes what the list costs, so it cannot be refused. */
export function moveRow(target: EnumTarget, from: number, slot: number): Op | null {
  const move = moveOpFor('', from, slot);
  if (move === null) {
    return null;
  }
  const rows = target.rows.filter((_, at) => at !== from);
  rows.splice(move.to, 0, target.rows[from]);
  return putRows(target.keysPath, rows);
}
