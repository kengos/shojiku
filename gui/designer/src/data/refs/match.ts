// Which references name a definitions node — the ONE predicate every usage
// count, usage list and rename shares.
//
// A reference names a node when it resolves in the node's own frame (`[]` at
// document scope, the carrying table's data path inside its rows) and its
// spelled key IS the node's relative key or runs through it (`customer.name`
// runs through the group `customer`). A reference in a DEEPER frame is relative
// to rows the node only carries (a table's columns read its rows, not the table
// itself), so renaming the table rewrites its source and nothing under it.

import type { DefsNode } from '../defsTree';
import type { DataRef } from './types';

/** The node's key relative to the rows that carry it, dotted. */
export function relativeKey(node: DefsNode): string {
  return node.dataPath.slice(node.scope?.length ?? 0).join('.');
}

export function sameFrame(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

/** Whether `spelled` (in `frame`) names the node at `nodeFrame`/`rel` or
 * something under it. */
export function namesUnder(
  frame: readonly string[],
  spelled: string,
  nodeFrame: readonly string[],
  rel: string,
): boolean {
  return sameFrame(frame, nodeFrame) && (spelled === rel || spelled.startsWith(`${rel}.`));
}

/** Every reference naming `node` or a node under it. Empty for the root. */
export function refsUnder(refs: readonly DataRef[], node: DefsNode): DataRef[] {
  if (node.kind === 'root') {
    return [];
  }
  const frame = node.scope ?? [];
  const rel = relativeKey(node);
  return refs.filter((ref) => namesUnder(ref.frame, ref.spelled, frame, rel));
}

/** Where a reference counts as a PLACE: its item — one item using a key in its
 * text and its link is one place, the palette's long-standing rule — except a
 * table column, which is a place of its own (two columns reading one row field
 * are two). The palette's projection keys its paths the same way. */
export function placePath(ref: DataRef): string {
  return ref.carrier === 'column' ? ref.path : ref.owner.path;
}

/** How many places use the node. */
export function placeCount(refs: readonly DataRef[]): number {
  return new Set(refs.map(placePath)).size;
}
