// The WRITE side of the params document: the named edit primitives the data
// editor commits through.
//
// Every primitive is a serializable `text -> text` transform (AI parity: an op
// an agent could emit) with a changed-guard, and every object rebuild is
// proto-safe — values come from `JSON.parse` (which defines `__proto__` as an
// inert own property, never the prototype) and are reconstructed with spread +
// computed keys (`CreateDataProperty` semantics), so a hostile
// `__proto__`/`constructor` key stays plain data.
//
// A missing intermediate map is CREATED (a definitions-declared field whose
// params parent does not exist yet must still be writable), but a path that
// CONTRADICTS the existing shape stays a no-op: creation never clobbers data.

import {
  isRecord,
  MAX_WALK_DEPTH,
  ownGet,
  parseParams,
  type SamplePath,
  type SampleScalar,
  serializeParams,
} from './model';

/** Read the value at a path without walking the prototype (returns `undefined`
 * when any segment does not match the shape). */
function getAtPath(node: unknown, path: SamplePath): unknown {
  let current: unknown = node;
  for (const seg of path) {
    if (typeof seg === 'number') {
      if (!Array.isArray(current) || seg < 0 || seg >= current.length) {
        return undefined;
      }
      current = current[seg];
    } else if (isRecord(current)) {
      current = ownGet(current, seg);
    } else {
      return undefined;
    }
  }
  return current;
}

/** Rebuild `node` with `value` placed at `path`, immutably and proto-safely
 * (spread + computed key). A MISSING intermediate map is CREATED (`{}` under a
 * string segment — mirroring designer-core `setScalar`'s auto-create, so a
 * definitions-declared field whose params parent does not exist yet is still
 * writable from the data editor); a path that CONTRADICTS the existing shape
 * (a segment into a scalar, an out-of-range/missing array index) stays a
 * no-op — creation never clobbers data and never invents array rows. */
function setAtPath(node: unknown, path: SamplePath, value: unknown): unknown {
  if (path.length === 0) {
    return value;
  }
  const [head, ...rest] = path;
  if (typeof head === 'number') {
    if (!Array.isArray(node) || head < 0 || head >= node.length) {
      return node;
    }
    const copy = node.slice();
    copy[head] = setAtPath(copy[head], rest, value);
    return copy;
  }
  if (node === undefined) {
    return { [head]: setAtPath(undefined, rest, value) };
  }
  if (!isRecord(node)) {
    return node;
  }
  return { ...node, [head]: setAtPath(ownGet(node, head), rest, value) };
}

/** Set a leaf value. A no-op when the new value equals the current one (the
 * changed-guard — a mere blur never rewrites the document), or when the path
 * does not match. */
export function setSampleValue(text: string, path: SamplePath, value: SampleScalar): string {
  const root = parseParams(text);
  if (root === null) {
    return text;
  }
  if (getAtPath(root, path) === value) {
    return text;
  }
  return serializeParams(setAtPath(root, path, value));
}

/** Add a fresh top-level scalar field (blank-start manual authoring). A no-op
 * when the key is empty or already present. */
export function addSampleField(text: string, key: string, value: SampleScalar): string {
  const root = parseParams(text);
  if (root === null || key === '' || Object.hasOwn(root, key)) {
    return text;
  }
  return serializeParams({ ...root, [key]: value });
}

/** A blank value shaped like `value` (same object keys, blanked leaves) — the
 * template for a new array row derived from existing rows. */
function blankLike(value: unknown, depth: number): unknown {
  if (Array.isArray(value)) {
    return [];
  }
  if (isRecord(value) && depth <= MAX_WALK_DEPTH) {
    let out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out = { ...out, [key]: blankLike(ownGet(value, key), depth + 1) };
    }
    return out;
  }
  if (typeof value === 'number') {
    return 0;
  }
  if (typeof value === 'boolean') {
    return false;
  }
  return '';
}

/** Append a row to an array, shaped like its existing rows (or an empty object
 * when the array is empty). A top-level key MISSING from params is treated as
 * an empty array and CREATED (a definitions-declared list whose data does not
 * exist yet must still gain its first row from the data editor); any other
 * non-array shape stays a no-op. */
export function addSampleRow(text: string, path: SamplePath): string {
  const root = parseParams(text);
  if (root === null) {
    return text;
  }
  const found = getAtPath(root, path);
  const missingTopLevel = found === undefined && path.length === 1 && typeof path[0] === 'string';
  if (!Array.isArray(found) && !missingTopLevel) {
    return text;
  }
  const arr = Array.isArray(found) ? found : [];
  const row = arr.length > 0 ? blankLike(arr[arr.length - 1], 0) : {};
  return serializeParams(setAtPath(root, path, [...arr, row]));
}

/** Remove one row from an array (an emptied array is kept as `[]`). A no-op
 * when the path is not an array or the index is out of range. */
export function removeSampleRow(text: string, path: SamplePath, index: number): string {
  const root = parseParams(text);
  if (root === null) {
    return text;
  }
  const arr = getAtPath(root, path);
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
    return text;
  }
  const next = [...arr.slice(0, index), ...arr.slice(index + 1)];
  return serializeParams(setAtPath(root, path, next));
}
