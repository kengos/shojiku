// The body switch back to flowing (absolute → flow): the children reordered
// top to bottom (y, then x — the order the eye reads them in, which a flow
// stacks by), the `y` a flow ignores dropped (`x` stays, a flow honours it as
// a horizontal offset), each line rebased to its top endpoint (`bodyLines`),
// and the topmost `y` kept as the region's top (`bodyRegion.topRegion`). The
// other direction, and the wire it switches between, is `bodyModel`.

import { MAX_BATCH_OPS, type Op, type ReadFn } from '@shojiku/designer-core';
import { lineFlowOps, lineTop } from './bodyLines';
import { BODY_PATH, bodyMode, children, ITEMS, record } from './bodyModel';
import { topRegion } from './bodyRegion';
import { REQUIRED_BOX_WIRE_TYPES } from './itemView';

/** Where a placed child sits: its `box` coordinate, a line's top endpoint
 * (for `y`) — 0 when it says nothing. */
function coordinate(child: unknown, key: 'x' | 'y'): number {
  const node = record(child);
  const value = record(node?.box)?.[key];
  if (key === 'y' && node?.type === 'line') {
    return lineTop(node) ?? 0;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** The absolute → flow batch: `type: flow`, the children reordered top to
 * bottom (stable), then each authored `y` dropped — unless that would empty a
 * box the type requires — and each line rebased to its top. `null` when the
 * body is not absolute, `'tooMany'` past the op cap. */
export function toFlowOps(read: ReadFn): Op[] | 'tooMany' | null {
  if (bodyMode(read) !== 'absolute') {
    return null;
  }
  const items = children(read);
  const order = items
    .map((child, index) => ({ child, index }))
    .sort(
      (a, b) =>
        coordinate(a.child, 'y') - coordinate(b.child, 'y') ||
        coordinate(a.child, 'x') - coordinate(b.child, 'x') ||
        a.index - b.index,
    );
  const ops: Op[] = [{ op: 'setScalar', path: BODY_PATH, keys: ['type'], value: 'flow' }];
  const region = topRegion(
    read,
    items.map((child) => coordinate(child, 'y')),
  );
  if (region !== null) {
    ops.push({ op: 'putValue', path: BODY_PATH, keys: ['box'], value: region });
  }
  // Place each child at its sorted position in turn; `current` mirrors the
  // list as the moves reorder it, so every index is valid when applied.
  const current = items.map((_, index) => index);
  order.forEach(({ index }, target) => {
    const from = current.indexOf(index);
    if (from !== target) {
      ops.push({ op: 'moveItem', path: ITEMS, from, to: target });
      current.splice(target, 0, ...current.splice(from, 1));
    }
  });
  order.forEach(({ child }, target) => {
    const node = record(child);
    if (node?.type === 'line') {
      ops.push(...lineFlowOps(node, `${ITEMS}[${target}]`));
      return;
    }
    const box = record(node?.box);
    if (box?.y === undefined) {
      return;
    }
    const emptied = Object.keys(box).length === 1;
    if (emptied && REQUIRED_BOX_WIRE_TYPES.has(String(record(child)?.type))) {
      return;
    }
    ops.push({ op: 'removeKey', path: `${ITEMS}[${target}]`, keys: ['box', 'y'] });
  });
  return ops.length > MAX_BATCH_OPS ? 'tooMany' : ops;
}
