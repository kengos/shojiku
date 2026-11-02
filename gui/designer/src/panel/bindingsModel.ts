// A list's `bindings:` declarations as its 「差し込みの設定」 reads and writes
// them: each name the per-entry text may write as `{name}`, what the text uses
// of it, the name a picked data key suggests, why a typed name cannot be
// added, and the one op each add and delete is. A name is valid exactly when
// `{name}` reads back as that one interpolation (`chipWire`) — the parser is
// the charset, never a second regex.

import type { CatalogField, Op } from '@shojiku/designer-core';
import { chipWire } from '../text/chipModel';
import { parseSegments } from '../text/interpolate';
import { record } from './itemView';

/** One declared name, and the map it carries (`undefined` for an entry that
 * is not a map, which has nothing a field could edit). */
export interface Declaration {
  readonly name: string;
  readonly values: Readonly<Record<string, unknown>> | undefined;
  /** The data key it reads (`''` when unset or not a string). */
  readonly key: string;
}

/** The fields of one declaration, as the catalog states them for the
 * `bindings` map — the required one (the data key it reads) first, the rest
 * in catalog order; none for a field of any other kind. */
export function entryFields(field: CatalogField): readonly CatalogField[] {
  const entry = field.spec.kind === 'map' ? field.spec.entry : [];
  return [...entry.filter((f) => f.required), ...entry.filter((f) => !f.required)];
}

/** The declarations of a `bindings:` value, in document order. */
export function readDeclarations(bindings: unknown): readonly Declaration[] {
  const map = record(bindings);
  if (map === undefined) {
    return [];
  }
  return Object.keys(map).map((name) => {
    const values = record(map[name]);
    const key = values?.key;
    return { name, values, key: typeof key === 'string' ? key : '' };
  });
}

/** How many times `text` writes `{name}` (a `{name:format}` counts too). */
export function usesOf(text: string, name: string): number {
  return parseSegments(text).filter((segment) => segment.kind === 'expr' && segment.key === name)
    .length;
}

/** The name a picked data key suggests: its last `.` segment when that is a
 * valid name, else `''` for the author to type. */
export function suggestedName(key: string): string {
  const last = key.slice(key.lastIndexOf('.') + 1);
  return last !== '' && chipWire(last) !== null ? last : '';
}

/** Why `name` cannot be added: `charset` (it would not read back as one
 * `{name}`), `taken` (already declared), or `null` when it can. An empty
 * name is no problem to report — the add stays disabled until one is typed. */
export function nameProblem(name: string, declared: readonly string[]): 'charset' | 'taken' | null {
  if (name === '') {
    return null;
  }
  if (chipWire(name) === null) {
    return 'charset';
  }
  return declared.includes(name) ? 'taken' : null;
}

/** The op declaring `name` to read `key` on a list whose `bindings:` value
 * is `bindings`: an entry in the map, or — absent, `~`, or anything else that
 * is not a map, which a write under it would fail on — the whole map. */
export function addDeclarationOp(path: string, name: string, key: string, bindings: unknown): Op {
  return record(bindings) === undefined
    ? { op: 'putValue', path, keys: ['bindings'], value: { [name]: { key } } }
    : { op: 'putValue', path, keys: ['bindings', name], value: { key } };
}

/** The op deleting the whole `name` entry — never its required `key` alone,
 * which would leave an entry that no longer parses. The last one takes the
 * empty `bindings:` with it. */
export function deleteDeclarationOp(path: string, name: string, declared: number): Op {
  return { op: 'removeKey', path, keys: declared === 1 ? ['bindings'] : ['bindings', name] };
}
