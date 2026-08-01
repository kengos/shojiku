// Resolving a target that may not exist yet: the two resolvers that CREATE what
// the path addresses. Both keep the "validate fully before mutating" rule — the
// map chain is walked read-only before anything is created, and the sequence
// auto-create is DEFERRED behind a thunk so index validation can still refuse
// with the document untouched. The read-only counterparts live in `opTarget.ts`.

import { type Document, isMap, isSeq, type YAMLMap, type YAMLSeq } from 'yaml';
import { checkKeys, resolveMap } from './opTarget';
import { clip, fail, OK, type OpError, type OpResult } from './opTypes';
import { parsePath, toYamlPath } from './path';

/** Resolve the sequence an `insertItem` targets. Unlike `resolveSeq`, a MISSING
 * final key on an existing map resolves to "create an empty sequence there" —
 * the auto-create counterpart of `setLeaf`'s missing-intermediate-map rule, so
 * inserting into a `body:` that omitted `items:` just works. The creation is
 * DEFERRED (returned as a thunk) so index validation can still fail with the
 * document untouched. */
export type InsertResolve =
  | { readonly ok: true; readonly seq: YAMLSeq }
  | { readonly ok: true; readonly seq: null; readonly create: () => YAMLSeq }
  | { readonly ok: false; readonly error: OpError };

export function resolveSeqForInsert(doc: Document, path: string): InsertResolve {
  const segments = parsePath(path);
  const node = doc.getIn(toYamlPath(segments));
  if (node !== undefined) {
    if (!isSeq(node)) {
      return {
        ok: false,
        error: { code: 'not_a_seq', message: `${clip(path)} is not a sequence` },
      };
    }
    return { ok: true, seq: node };
  }
  const last = segments[segments.length - 1];
  if (last.kind !== 'key') {
    return { ok: false, error: { code: 'path_not_found', message: `no node at ${clip(path)}` } };
  }
  const parentPath = segments.slice(0, -1);
  const parent = parentPath.length === 0 ? doc.contents : doc.getIn(toYamlPath(parentPath));
  if (parent === undefined || parent === null) {
    return { ok: false, error: { code: 'path_not_found', message: `no node at ${clip(path)}` } };
  }
  if (!isMap(parent)) {
    return {
      ok: false,
      error: { code: 'not_a_map', message: `${clip(path)} parent is not a map` },
    };
  }
  return {
    ok: true,
    seq: null,
    create: () => {
      const fresh = doc.createNode([]) as unknown as YAMLSeq;
      parent.set(last.key, fresh);
      return fresh;
    },
  };
}

/** Resolve the map that should hold the final key, creating missing
 * intermediate maps under `path`. Two passes over the intermediate keys keep it
 * mutation-safe: pass one walks the EXISTING chain and fails on a non-map
 * intermediate (the only place that can happen — once a key is missing every
 * key below it is missing too) without mutating; pass two creates the remaining
 * (all-missing) maps. So a failure returns with the document untouched. */
export function setLeaf(
  doc: Document,
  path: string | undefined,
  keys: readonly string[],
  leaf: unknown,
): OpResult {
  const shape = checkKeys(keys);
  if (!shape.ok) {
    return shape;
  }
  const resolved = resolveMap(doc, path);
  if (!resolved.ok) {
    return resolved;
  }
  const intermediates = keys.slice(0, -1);
  let map = resolved.map;
  let cursor = 0;
  for (; cursor < intermediates.length; cursor++) {
    const child = map.get(intermediates[cursor], true);
    if (child === undefined) {
      break;
    }
    if (!isMap(child)) {
      return fail('not_a_map', `${clip(intermediates[cursor])} is not a map`);
    }
    map = child;
  }
  for (; cursor < intermediates.length; cursor++) {
    const fresh = doc.createNode({}) as unknown as YAMLMap;
    map.set(intermediates[cursor], fresh);
    map = fresh;
  }
  map.set(keys[keys.length - 1], leaf);
  return OK;
}
