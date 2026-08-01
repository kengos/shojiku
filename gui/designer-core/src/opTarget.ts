// Where an op LANDS: resolving the map / sequence / pair a path addresses, and
// the key-path shape guard every map-key op runs first. Everything here is
// read-only over the document — it refuses (`path_not_found`/`not_a_map`/
// `not_a_seq`) without mutating, which is what lets `applyOp` validate fully
// before touching anything. The resolvers that CREATE a missing target live in
// `opCreate.ts`.

import { type Document, isMap, isScalar, isSeq, type Pair, type YAMLMap, type YAMLSeq } from 'yaml';
import { clip, fail, OK, type OpError, type OpResult, pathLabel } from './opTypes';
import { parsePath, toYamlPath } from './path';

/** Maximum key-path depth an op may drill (the property nesting under an item).
 * A property path this deep is a bug or a hostile op, never a real template. */
export const MAX_KEY_DEPTH = 16;

export type MapResolve =
  | { readonly ok: true; readonly map: YAMLMap }
  | { readonly ok: false; readonly error: OpError };
export type SeqResolve =
  | { readonly ok: true; readonly seq: YAMLSeq }
  | { readonly ok: false; readonly error: OpError };

export function resolveMap(doc: Document, path: string | undefined): MapResolve {
  // Absent path → the document root map. An empty document has no root to
  // address; a scalar/sequence root is not a map. Either fails without touching
  // the document, mirroring the missing/wrong-kind cases below.
  if (path === undefined) {
    const root = doc.contents;
    if (root === null || root === undefined) {
      return { ok: false, error: { code: 'path_not_found', message: 'document root is empty' } };
    }
    if (!isMap(root)) {
      return { ok: false, error: { code: 'not_a_map', message: 'document root is not a map' } };
    }
    return { ok: true, map: root };
  }
  const node = doc.getIn(toYamlPath(parsePath(path)));
  if (node === undefined) {
    return { ok: false, error: { code: 'path_not_found', message: `no node at ${clip(path)}` } };
  }
  if (!isMap(node)) {
    return { ok: false, error: { code: 'not_a_map', message: `${clip(path)} is not a map` } };
  }
  return { ok: true, map: node };
}

export function resolveSeq(doc: Document, path: string): SeqResolve {
  const node = doc.getIn(toYamlPath(parsePath(path)));
  if (node === undefined) {
    return { ok: false, error: { code: 'path_not_found', message: `no node at ${clip(path)}` } };
  }
  if (!isSeq(node)) {
    return { ok: false, error: { code: 'not_a_seq', message: `${clip(path)} is not a sequence` } };
  }
  return { ok: true, seq: node };
}

export function inRange(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/** Validate a key path's shape (independent of the document): non-empty, within
 * the depth cap, no empty segment. */
export function checkKeys(keys: readonly string[]): OpResult {
  if (keys.length === 0) {
    return fail('invalid_value', 'empty key path');
  }
  if (keys.length > MAX_KEY_DEPTH) {
    return fail('invalid_value', `key path deeper than ${MAX_KEY_DEPTH}`);
  }
  for (const key of keys) {
    if (key.length === 0) {
      return fail('invalid_value', 'empty key in path');
    }
  }
  return OK;
}

/** The maps an existing key chain passes through: `chain[0]` is the map the
 * path resolved to and `chain[i]` the map reached after `keys[i - 1]`, so the
 * caller can both edit the deepest one and walk back up to prune. */
export type ChainResolve =
  | { readonly ok: true; readonly chain: readonly YAMLMap[] }
  | { readonly ok: false; readonly error: OpError };

/** Walk the INTERMEDIATE keys of an EXISTING key chain (everything but the
 * final key), collecting the maps passed through and failing on a missing or
 * non-map hop — the read the rename and remove edits share, with the document
 * still untouched. Never creates: the auto-creating counterpart is `setLeaf`. */
export function walkIntermediates(
  start: YAMLMap,
  path: string | undefined,
  keys: readonly string[],
): ChainResolve {
  const chain: YAMLMap[] = [start];
  let map = start;
  for (const key of keys.slice(0, -1)) {
    const child = map.get(key, true);
    if (child === undefined) {
      return {
        ok: false,
        error: {
          code: 'key_not_found',
          message: `${pathLabel(path)} has no key path ${clip(keys.join('.'))}`,
        },
      };
    }
    if (!isMap(child)) {
      return { ok: false, error: { code: 'not_a_map', message: `${clip(key)} is not a map` } };
    }
    map = child;
    chain.push(map);
  }
  return { ok: true, chain };
}

/** Find the `Pair` in a map whose key equals `key`, replicating eemeli's own
 * key comparison: an op-created key is a RAW string (`map.set` stores the
 * string directly), a parsed key is a `Scalar` — so both forms must match. */
export function findPairByKey(map: YAMLMap, key: string): Pair | undefined {
  for (const pair of map.items) {
    const k = pair.key;
    if (k === key) {
      return pair;
    }
    if (isScalar(k) && k.value === key) {
      return pair;
    }
  }
  return undefined;
}
