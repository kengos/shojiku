// Re-keying the sample data when a definitions node is renamed or deleted: the
// node's key moves (or goes) in EVERY place the params hold it — under each
// object its definitions path runs through, and in every row of every array on
// the way (`items` in a keys path = each element). Without this a workshop
// stub, re-inferred from the sample on every render, would bring the old field
// straight back.
//
// Proto-safe like every params write: values come from `JSON.parse` and objects
// are rebuilt through `Object.fromEntries` (CreateDataProperty — a hostile
// `__proto__` key stays plain data), with own-property reads only. A rename
// keeps the key's POSITION in its object. A path the data contradicts is
// skipped, never forced.

import { isRecord, ownGet, parseParams, type SamplePath, serializeParams } from './model';

/** One value a delete took out of the params: its concrete path, the value,
 * and the key's position in its object (so an undo puts it back in place). */
export interface RemovedValue {
  readonly path: SamplePath;
  readonly value: unknown;
  readonly position: number;
}

type LeafFn = (
  map: Record<string, unknown>,
  name: string,
  at: SamplePath,
) => Record<string, unknown>;

/** Walk `node` along a definitions keys path (`properties` + name per object,
 * `items` per array), applying `leaf` to the object holding the final name. */
function along(
  node: unknown,
  keys: readonly string[],
  index: number,
  at: SamplePath,
  leaf: LeafFn,
): unknown {
  if (keys[index] === 'items') {
    if (!Array.isArray(node)) {
      return node;
    }
    const next = node.map((entry, row) => along(entry, keys, index + 1, [...at, row], leaf));
    return next.every((entry, row) => entry === node[row]) ? node : next;
  }
  const name = keys[index + 1];
  if (keys[index] !== 'properties' || name === undefined || !isRecord(node)) {
    return node;
  }
  if (index + 2 === keys.length) {
    return leaf(node, name, at);
  }
  if (!Object.hasOwn(node, name)) {
    return node;
  }
  const child = ownGet(node, name);
  const next = along(child, keys, index + 2, [...at, name], leaf);
  return next === child
    ? node
    : Object.fromEntries(
        Object.entries(node).map(([key, value]) => [key, key === name ? next : value]),
      );
}

function rewrite(text: string, keysPath: readonly string[], leaf: LeafFn): string {
  const root = parseParams(text);
  if (root === null) {
    return text;
  }
  const next = along(root, keysPath, 0, [], leaf);
  return next === root ? text : serializeParams(next);
}

/** Rename the key at `keysPath` to `to` wherever the params hold it. An object
 * that already holds `to` is left as it is (renaming would overwrite data). */
export function renameSampleKey(text: string, keysPath: readonly string[], to: string): string {
  return rewrite(text, keysPath, (map, name) =>
    !Object.hasOwn(map, name) || Object.hasOwn(map, to)
      ? map
      : Object.fromEntries(
          Object.entries(map).map(([key, value]) => [key === name ? to : key, value]),
        ),
  );
}

/** Remove the key at `keysPath` wherever the params hold it, reporting what was
 * removed (for undo). */
export function removeSampleKey(
  text: string,
  keysPath: readonly string[],
): { readonly text: string; readonly removed: readonly RemovedValue[] } {
  const removed: RemovedValue[] = [];
  const next = rewrite(text, keysPath, (map, name, at) => {
    if (!Object.hasOwn(map, name)) {
      return map;
    }
    const position = Object.keys(map).indexOf(name);
    removed.push({ path: [...at, name], value: ownGet(map, name), position });
    return Object.fromEntries(Object.entries(map).filter(([key]) => key !== name));
  });
  return { text: next, removed };
}

/** Put removed values back where they were, wherever that place still exists
 * and is empty (a row since deleted, or a key since re-added, is skipped), at
 * the key's old position in its object. */
export function restoreSampleValues(text: string, removed: readonly RemovedValue[]): string {
  let root: unknown = parseParams(text);
  if (root === null) {
    return text;
  }
  const original = root;
  for (const entry of removed) {
    root = insertAt(root, entry.path, entry.value, entry.position);
  }
  return root === original ? text : serializeParams(root);
}

function insertAt(node: unknown, path: SamplePath, value: unknown, position: number): unknown {
  const [head, ...rest] = path;
  if (typeof head === 'number') {
    if (!Array.isArray(node) || head < 0 || head >= node.length || rest.length === 0) {
      return node;
    }
    const child = insertAt(node[head], rest, value, position);
    return child === node[head] ? node : node.map((entry, row) => (row === head ? child : entry));
  }
  if (head === undefined || !isRecord(node)) {
    return node;
  }
  if (rest.length === 0) {
    if (Object.hasOwn(node, head)) {
      return node;
    }
    const entries = Object.entries(node);
    entries.splice(position, 0, [head, value]);
    return Object.fromEntries(entries);
  }
  if (!Object.hasOwn(node, head)) {
    return node;
  }
  const child = ownGet(node, head);
  const next = insertAt(child, rest, value, position);
  return next === child
    ? node
    : Object.fromEntries(
        Object.entries(node).map(([key, entry]) => [key, key === head ? next : entry]),
      );
}
