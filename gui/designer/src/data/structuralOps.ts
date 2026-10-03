// What counts as a STRUCTURAL definitions edit — a node's rename or removal —
// as opposed to a content edit (an add, a leaf change). The edit list keeps the
// structural ops first (`defsRestructure.ts`), and coalescing never drops one
// (`coalesceDefsEdit`); this leaf module is the one predicate both read.

import type { Op } from '@shojiku/designer-core';

/** Whether `keys` addresses a NODE: `properties` + name pairs, with `items`
 * stepping into an array's element, ending on a name. */
export function isNodeKeys(keys: readonly string[]): boolean {
  let index = 0;
  let node = false;
  while (index < keys.length) {
    if (keys[index] === 'items') {
      index += 1;
      node = false;
    } else if (keys[index] === 'properties' && index + 1 < keys.length) {
      index += 2;
      node = true;
    } else {
      return false;
    }
  }
  return node;
}

/** A node rename / removal. */
export type StructuralOp = Extract<Op, { readonly op: 'renameKey' | 'removeKey' }>;

/** A structural op: a rename or removal of a node. */
export function isStructural(op: Op): op is StructuralOp {
  return (
    (op.op === 'renameKey' || op.op === 'removeKey') && op.path === undefined && isNodeKeys(op.keys)
  );
}
