// What `moveItem` DOES — the one sequence op that can address TWO sequences.
// Without `toPath` it reorders inside `path`, which is what it has always
// done; with one it moves the element to a different sequence, and it does so
// by SPLICING the very node rather than re-composing it, so the moved
// subtree's comments, quoting style, anchors and aliases all survive. That is
// the whole reason a cross-parent move is an op of its own rather than a
// `removeItem` + `insertItem` pair: `insertItem` takes a plain JSON snippet,
// which cannot carry any of them.
//
// ONE index rule covers both forms: `to` is the index in the DESTINATION
// sequence after the source removal. Same-sequence that is the post-splice
// index; cross-sequence the removal does not shift the destination, so it is
// the plain insertion index (and, like `insertItem`, it admits `length` to
// append).

import type { Document, Node, YAMLSeq } from 'yaml';
import { isAlias, isCollection, isMap, isNode, visit } from 'yaml';
import { inRange, resolveSeq } from './opTarget';
import { clip, fail, OK, type Op, type OpResult } from './opTypes';

type MoveOp = Extract<Op, { op: 'moveItem' }>;

/** Whether `target` IS `root` or sits anywhere inside it. The walk never
 * dereferences an alias, and a parsed document is a TREE (an alias is a leaf
 * `Alias` node, not a back-edge), so it always terminates without a budget —
 * and this check is itself what keeps the tree a tree, since the only way to
 * create a cycle through the op surface is to move a node into its own
 * subtree. */
function holds(root: unknown, target: YAMLSeq): boolean {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === target) {
      return true;
    }
    if (isMap(node)) {
      for (const pair of node.items) {
        pending.push(pair.value);
      }
    } else if (isCollection(node)) {
      pending.push(...node.items);
    }
  }
  return false;
}

/** Whether `node` touches anchors at all — defines one, or aliases one.
 * A move involving none cannot change any anchor/alias pair's relative order,
 * so it needs no verification and pays nothing. */
function touchesAnchors(node: unknown): boolean {
  let touches = false;
  // Collections in a parsed document hold only nodes — the same invariant
  // `duplicateItem`'s `clone()` cast rests on — so this is total.
  visit(node as Node, (_key, child) => {
    if (isAlias(child) || (isNode(child) && typeof child.anchor === 'string')) {
      touches = true;
      return visit.BREAK;
    }
  });
  return touches;
}

/** Whether the document can still be WRITTEN OUT. `eemeli/yaml` verifies
 * alias order at stringify time and throws `Unresolved alias (the anchor must
 * be set before the alias)`, and `serializeTemplate` is a bare `toString()`,
 * so a move that strands an anchor would surface as a crashing save rather
 * than a diagnostic. The library is the only exact oracle for this — a
 * boundary-crossing heuristic refuses the ordinary shape (a shared `anchors:`
 * block at the top of the file, aliased throughout) that is perfectly safe. */
function writable(doc: Document): boolean {
  try {
    doc.toString();
    return true;
  } catch {
    return false;
  }
}

const ANCHOR_REFUSAL = 'moving this item would place a YAML anchor after an alias to it';

/** The reorder inside one sequence: `to` is the index the element takes once
 * it has been lifted out, so both indices address the CURRENT list. */
function moveWithin(doc: Document, items: unknown[], op: MoveOp): OpResult {
  if (!inRange(op.to, items.length)) {
    return fail(
      'index_out_of_range',
      `move ${op.from}->${op.to} out of range for ${clip(op.path)}`,
    );
  }
  const [node] = items.splice(op.from, 1);
  items.splice(op.to, 0, node);
  if (touchesAnchors(node) && !writable(doc)) {
    items.splice(op.to, 1);
    items.splice(op.from, 0, node);
    return fail('invalid_value', ANCHOR_REFUSAL);
  }
  return OK;
}

/** Apply a `moveItem`. Every refusal happens before the first splice, so a
 * failed move leaves the document byte-identical. */
export function applyMoveItem(doc: Document, op: MoveOp): OpResult {
  const source = resolveSeq(doc, op.path);
  if (!source.ok) {
    return source;
  }
  const items = source.seq.items;
  if (!inRange(op.from, items.length)) {
    return fail(
      'index_out_of_range',
      `move ${op.from}->${op.to} out of range for ${clip(op.path)}`,
    );
  }
  if (op.toPath === undefined) {
    return moveWithin(doc, items, op);
  }
  const dest = resolveSeq(doc, op.toPath);
  if (!dest.ok) {
    return dest;
  }
  // Identity, not string equality: two spellings of one path address the same
  // node, and a move onto itself must keep the post-splice index rule.
  if (dest.seq === source.seq) {
    return moveWithin(doc, items, op);
  }
  if (!Number.isInteger(op.to) || op.to < 0 || op.to > dest.seq.items.length) {
    return fail(
      'index_out_of_range',
      `move ${op.from}->${op.to} out of range for ${clip(op.toPath)}`,
    );
  }
  if (holds(items[op.from], dest.seq)) {
    return fail('invalid_value', `${clip(op.toPath)} is inside the item being moved`);
  }
  // As in `insertItem`: the first element to land in an empty sequence clears
  // the flow flag, so an authored `items: []` stops reading as `items: [ … ]`.
  const flow = dest.seq.flow;
  if (dest.seq.items.length === 0) {
    dest.seq.flow = false;
  }
  const [node] = items.splice(op.from, 1);
  dest.seq.items.splice(op.to, 0, node);
  if (touchesAnchors(node) && !writable(doc)) {
    dest.seq.items.splice(op.to, 1);
    dest.seq.flow = flow;
    items.splice(op.from, 0, node);
    return fail('invalid_value', ANCHOR_REFUSAL);
  }
  return OK;
}
