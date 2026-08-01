// The MAP-KEY half of the op surface: the five ops that address a value by a
// key path (`path?` + `keys`) rather than by a sequence index. Each validates
// fully before mutating — the key-path shape first, then the target, then the
// value — so a refusal leaves the document untouched.

import { type Document, isScalar, type YAMLSeq } from 'yaml';
import { setLeaf } from './opCreate';
import { checkKeys, findPairByKey, resolveMap, walkIntermediates } from './opTarget';
import { clip, fail, OK, type Op, type OpResult, pathLabel } from './opTypes';
import { checkSnippetValue } from './snippet';

/** Maximum string entries a `setStrings` op may write — the engine's
 * `styleNames` / registry cap, so anything larger would be rejected downstream
 * anyway. */
export const MAX_STRING_VALUES = 256;

/** The ops addressing a map key: `path` is optional on every one of them (absent
 * = the document root map). */
export type KeyOp = Extract<
  Op,
  { op: 'setScalar' | 'setStrings' | 'removeKey' | 'renameKey' | 'putValue' }
>;

/** Apply one map-key op in place. */
export function applyKeyOp(doc: Document, op: KeyOp): OpResult {
  switch (op.op) {
    case 'setScalar': {
      // The engine parse-rejects non-finite numbers (its yaml guard), so the
      // op layer refuses to author them rather than producing a template the
      // engine cannot load.
      if (typeof op.value === 'number' && !Number.isFinite(op.value)) {
        return fail('invalid_value', 'non-finite number');
      }
      return setLeaf(doc, op.path, op.keys, op.value);
    }
    case 'setStrings': {
      if (op.values.length === 0) {
        return fail('invalid_value', 'empty string list (use removeKey to clear)');
      }
      if (op.values.length > MAX_STRING_VALUES) {
        return fail('invalid_value', `string list over ${MAX_STRING_VALUES}`);
      }
      // A flow sequence (`[ a, b ]`) matches the form the bundled presets store
      // list values in, so a GUI-written list reads the same as an authored one.
      const shape = checkKeys(op.keys);
      if (!shape.ok) {
        return shape;
      }
      return setLeaf(doc, op.path, op.keys, flowStrings(doc, op.values));
    }
    case 'removeKey': {
      const shape = checkKeys(op.keys);
      if (!shape.ok) {
        return shape;
      }
      return removeKeyPath(doc, op.path, op.keys);
    }
    case 'renameKey': {
      const shape = checkKeys(op.keys);
      if (!shape.ok) {
        return shape;
      }
      if (op.to.length === 0) {
        return fail('invalid_value', 'empty rename target');
      }
      return renameKeyPath(doc, op.path, op.keys, op.to);
    }
    case 'putValue': {
      // Validate the whole subtree BEFORE any mutation (the insertItem snippet
      // discipline): finite scalars, plain maps, bounded depth/nodes — the depth
      // bound also terminates a cyclic hostile value. `createNode` is pure (it
      // builds a detached node), so a later `setLeaf` key-shape failure still
      // leaves the document untouched.
      const shape = checkSnippetValue(op.value);
      if (!shape.ok) {
        return shape;
      }
      return setLeaf(doc, op.path, op.keys, doc.createNode(op.value));
    }
  }
}

/** Build a flow sequence of string scalars, matching the `[ a, b ]` form the
 * bundled presets store list values in. */
function flowStrings(doc: Document, values: readonly string[]): YAMLSeq {
  const seq = doc.createNode([...values]) as unknown as YAMLSeq;
  seq.flow = true;
  return seq;
}

/** Rename the map key addressed by `keys` under `path`, keeping the value node
 * (and its position + comments) in place: locate the `Pair` and replace only its
 * KEY scalar. A delete+set would append the key at the map's tail (losing
 * position) and a `createNode` from raw text is the only place a hostile `to`
 * (`"a: b"`, quotes, newlines) is authored as a QUOTED scalar, so it round-trips
 * to the same key string with no structural injection.
 *
 * The old key NODE may carry document furniture of its own — a `commentBefore`
 * (the `# comment` line above the entry), a `spaceBefore` blank line, a trailing
 * `comment`, and an `anchor` (`&a key:` — which an alias elsewhere may point
 * at; dropping it would make the NEXT serialization throw "Unresolved alias").
 * All four are copied onto the replacement scalar so a rename never deletes an
 * author's comment or breaks an alias. */
function renameKeyPath(
  doc: Document,
  path: string | undefined,
  keys: readonly string[],
  to: string,
): OpResult {
  const resolved = resolveMap(doc, path);
  if (!resolved.ok) {
    return resolved;
  }
  const walked = walkIntermediates(resolved.map, path, keys);
  if (!walked.ok) {
    return walked;
  }
  const map = walked.chain[walked.chain.length - 1];
  const finalKey = keys[keys.length - 1];
  const pair = findPairByKey(map, finalKey);
  if (pair === undefined) {
    return fail('key_not_found', `${pathLabel(path)} has no key path ${clip(keys.join('.'))}`);
  }
  if (to === finalKey) {
    return fail('invalid_value', 'rename target equals source');
  }
  if (map.has(to)) {
    return fail('invalid_value', `key ${clip(to)} already exists`);
  }
  const fresh = doc.createNode(to);
  const old = pair.key;
  if (isScalar(old)) {
    // A parsed key node carries its own furniture; an op-created raw-string
    // key has none to carry over.
    fresh.commentBefore = old.commentBefore;
    fresh.comment = old.comment;
    fresh.spaceBefore = old.spaceBefore;
    fresh.anchor = old.anchor;
  }
  pair.key = fresh;
  return OK;
}

function removeKeyPath(doc: Document, path: string | undefined, keys: readonly string[]): OpResult {
  const resolved = resolveMap(doc, path);
  if (!resolved.ok) {
    return resolved;
  }
  // The parent chain is collected read-only, so a later prune can walk back up.
  // Any missing or non-map intermediate fails there with the doc untouched.
  const walked = walkIntermediates(resolved.map, path, keys);
  if (!walked.ok) {
    return walked;
  }
  const { chain } = walked;
  const map = chain[chain.length - 1];
  const intermediates = keys.slice(0, -1);
  const finalKey = keys[keys.length - 1];
  if (!map.has(finalKey)) {
    return fail('key_not_found', `${pathLabel(path)} has no key path ${clip(keys.join('.'))}`);
  }
  map.delete(finalKey);
  // Prune from the deepest map upward: an intermediate emptied by the delete is
  // removed from its own parent, stopping at the first still-populated map.
  for (let i = intermediates.length - 1; i >= 0; i--) {
    if (chain[i + 1].items.length === 0) {
      chain[i].delete(intermediates[i]);
    } else {
      break;
    }
  }
  return OK;
}
