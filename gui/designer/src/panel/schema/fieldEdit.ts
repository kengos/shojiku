// What a catalog-driven field section hands its host: one `FieldEdit` per
// commit, relative to the object the section edits (a named style's map,
// `defaults.style`, an item). The section never builds an op, because two kinds
// of host consume it: a LIVE host turns each edit into one op at once
// (`fieldEditOp`), a DRAFT host (the named-style form) keeps the value until
// its own save. Also the reads every field shares: whether the object holds a
// key, the value as an input's text, and whether an edit would change anything.

import type { Op, SnippetValue } from '@shojiku/designer-core';

/** One committed field: the keys under the edited object, and the wire value
 * to author there — `undefined` removes the key. */
export interface FieldEdit {
  readonly keys: readonly string[];
  readonly value: SnippetValue | undefined;
}

/** The edited object's own keys as the section reads them. */
export type FieldValues = Readonly<Record<string, unknown>>;

/** The value at `key`, `undefined` for absent — an inherited name
 * (`constructor`) never reads as a value. */
export function valueAt(values: FieldValues, key: string): unknown {
  return Object.hasOwn(values, key) ? values[key] : undefined;
}

/** Whether the object authors `key`; a `~` (null) is the unset spelling. */
export function isSet(values: FieldValues, key: string): boolean {
  const value = valueAt(values, key);
  return value !== undefined && value !== null;
}

/** How many of `keys` the object authors. */
export function setCount(values: FieldValues, keys: readonly string[]): number {
  return keys.filter((key) => isSet(values, key)).length;
}

/** A scalar as the text an input shows: a string as itself, a finite number in
 * its shortest spelling; `null` for anything an input cannot show. */
export function scalarText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

/** Whether authoring `next` over `current` changes nothing: unset (absent or
 * `~`) equals unset, scalars compare by value, and maps and lists by their
 * serialized form. */
export function sameValue(current: unknown, next: SnippetValue | undefined): boolean {
  const unset = current === undefined || current === null;
  if (next === undefined || unset) {
    return next === undefined && unset;
  }
  return typeof next === 'object'
    ? JSON.stringify(current) === JSON.stringify(next)
    : current === next;
}

/** The op a live host dispatches for one edit of the object at `path` +
 * `base`: a removal for `undefined`, a scalar write for a scalar (which keeps
 * the node's comments), and a whole-node write for a map or list. */
export function fieldEditOp(
  path: string | undefined,
  base: readonly string[],
  edit: FieldEdit,
): Op {
  const keys = [...base, ...edit.keys];
  if (edit.value === undefined) {
    return { op: 'removeKey', path, keys };
  }
  return typeof edit.value === 'object'
    ? { op: 'putValue', path, keys, value: edit.value }
    : { op: 'setScalar', path, keys, value: edit.value };
}
