// A field's declared display VARIANTS (`displayFormats: [{ id, label? }]`) as the
// data-item editor edits them: the list read in full, the edits over it, and
// the op that writes it back.
//
// What the list DOES is narrower than its name suggests: the placement picker
// does not offer it yet, but a NON-EMPTY list narrows which placement picks
// validate without `unknown_format` (engine/core/src/validate/bindings.rs) — so
// declaring one can make an existing placement warn. The section says so.
//
// Every edit writes the WHOLE list as one `putValue` (the choices editor's
// reason, `enumModel.ts`: the sequence ops cannot spell a data name such as
// `取引先`), an empty label OMITS `label`, and emptying the list REMOVES the key.
// The writable length is bounded by designer-core's snippet budget. A list this
// editor could not write back as found — not a list, an entry other than an
// `{ id, label? }` map of strings, one id twice, or over that bound — is READ-ONLY rather than
// rewritten (the engine's `deny_unknown_fields` already refuses most such files).

import { MAX_SNIPPET_NODES, type Op, type SnippetValue } from '@shojiku/designer-core';
import { moveOpFor } from '../tree/reorder';
import { own, readSchemaNode, record } from './schemaNode';

/** One declared variant; an empty `label` is written as no `label` at all. */
export interface FormatRow {
  readonly id: string;
  readonly label: string;
}

export type FormatsRead =
  | { readonly kind: 'rows'; readonly rows: readonly FormatRow[] }
  | { readonly kind: 'readonly'; readonly reason: 'shape' | 'too_long'; readonly count: number };

export type FormatsRefusal = 'empty' | 'duplicate' | 'full';

export type FormatsEdit =
  | { readonly ok: true; readonly op: Op | null }
  | { readonly ok: false; readonly refusal: FormatsRefusal };

/** The longest lists one op can write: every row labeled (a map of two strings,
 * 3 nodes) and none labeled (a map of one, 2 nodes), plus the list itself. */
export const FORMATS_MAX_LABELED = Math.floor((MAX_SNIPPET_NODES - 1) / 3);
export const FORMATS_MAX_BARE = Math.floor((MAX_SNIPPET_NODES - 1) / 2);

/** The nodes a written list costs in designer-core's snippet budget. */
export function formatsNodes(rows: readonly FormatRow[]): number {
  return rows.reduce((sum, row) => sum + (row.label === '' ? 2 : 3), 1);
}

function entry(raw: unknown): FormatRow | undefined {
  const map = record(raw);
  if (map === undefined) {
    return undefined;
  }
  const keys = Object.keys(map);
  const id = own(map, 'id');
  const label = own(map, 'label');
  const known = keys.every((key) => key === 'id' || key === 'label');
  if (!known || typeof id !== 'string' || (label !== undefined && typeof label !== 'string')) {
    return undefined;
  }
  return { id, label: label ?? '' };
}

export function readFormats(defsText: string, keysPath: readonly string[]): FormatsRead {
  const raw = own(readSchemaNode(defsText, keysPath), 'displayFormats');
  if (raw === undefined) {
    return { kind: 'rows', rows: [] };
  }
  if (!Array.isArray(raw)) {
    return { kind: 'readonly', reason: 'shape', count: 0 };
  }
  const rows: FormatRow[] = [];
  // Read one past the writable bound at most: a hostile list of thousands is
  // judged too long without walking all of it.
  for (const item of raw.slice(0, FORMATS_MAX_BARE + 1)) {
    const row = entry(item);
    if (row === undefined) {
      return { kind: 'readonly', reason: 'shape', count: raw.length };
    }
    // An empty label written as `label: ''` would change form on the next edit.
    if (row.label === '' && own(record(item), 'label') !== undefined) {
      return { kind: 'readonly', reason: 'shape', count: raw.length };
    }
    rows.push(row);
  }
  if (formatsNodes(rows) > MAX_SNIPPET_NODES) {
    return { kind: 'readonly', reason: 'too_long', count: raw.length };
  }
  // The editor never writes one id twice and the rows are identified by id, so a
  // hand-written repeat (the engine accepts it) is read, not edited.
  return new Set(rows.map((row) => row.id)).size === rows.length
    ? { kind: 'rows', rows }
    : { kind: 'readonly', reason: 'shape', count: raw.length };
}

/** The op writing `rows` (`removeKey` once empty), or `full`. */
export function writeFormats(keysPath: readonly string[], rows: readonly FormatRow[]): FormatsEdit {
  const keys = [...keysPath, 'displayFormats'];
  if (rows.length === 0) {
    return { ok: true, op: { op: 'removeKey', keys } };
  }
  if (formatsNodes(rows) > MAX_SNIPPET_NODES) {
    return { ok: false, refusal: 'full' };
  }
  return { ok: true, op: putFormats(keysPath, rows) };
}

/** The `putValue` writing `rows`, each without `label` when it has none. */
function putFormats(keysPath: readonly string[], rows: readonly FormatRow[]): Op {
  const value: SnippetValue[] = rows.map(
    (row): SnippetValue => (row.label === '' ? { id: row.id } : { id: row.id, label: row.label }),
  );
  return { op: 'putValue', keys: [...keysPath, 'displayFormats'], value };
}

/** What a list edit addresses: the field's keys path and the rows as read. */
export interface FormatsTarget {
  readonly keysPath: readonly string[];
  readonly rows: readonly FormatRow[];
}

function checkId(target: FormatsTarget, raw: string, except: number): FormatsRefusal | null {
  if (raw.trim() === '') {
    return 'empty';
  }
  return target.rows.some((row, index) => index !== except && row.id === raw) ? 'duplicate' : null;
}

/** Append a variant (an empty label writes no `label`). */
export function addFormat(target: FormatsTarget, rawId: string, rawLabel: string): FormatsEdit {
  const refusal = checkId(target, rawId, -1);
  return refusal === null
    ? writeFormats(target.keysPath, [...target.rows, { id: rawId, label: rawLabel }])
    : { ok: false, refusal };
}

/** Change one variant's id; an unchanged entry authors nothing. */
export function setFormatId(target: FormatsTarget, index: number, raw: string): FormatsEdit {
  if (raw === target.rows[index].id) {
    return { ok: true, op: null };
  }
  const refusal = checkId(target, raw, index);
  if (refusal !== null) {
    return { ok: false, refusal };
  }
  return writeFormats(
    target.keysPath,
    target.rows.map((row, at) => (at === index ? { ...row, id: raw } : row)),
  );
}

/** Change one variant's label; an unchanged entry authors nothing. */
export function setFormatLabel(target: FormatsTarget, index: number, raw: string): FormatsEdit {
  if (raw === target.rows[index].label) {
    return { ok: true, op: null };
  }
  return writeFormats(
    target.keysPath,
    target.rows.map((row, at) => (at === index ? { ...row, label: raw } : row)),
  );
}

export function removeFormat(target: FormatsTarget, index: number): FormatsEdit {
  return writeFormats(
    target.keysPath,
    target.rows.filter((_, at) => at !== index),
  );
}

/** Move the variant at `from` into insertion slot `slot` (0..count) — the shared
 * slot math; `null` when it would not move. A reorder never changes the cost. */
export function moveFormat(target: FormatsTarget, from: number, slot: number): Op | null {
  const move = moveOpFor('', from, slot);
  if (move === null) {
    return null;
  }
  const rows = target.rows.filter((_, at) => at !== from);
  rows.splice(move.to, 0, target.rows[from]);
  return putFormats(target.keysPath, rows);
}
