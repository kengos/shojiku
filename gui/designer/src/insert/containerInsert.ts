// Pure resolver for the container-insert picker's destination: nest-into-slot
// vs the ordinary append. When the shared selection is an untouched PLACEHOLDER
// slot that is a DIRECT child of a container, a picked shape REPLACES that slot
// in place (the stack → pick-a-slot → insert-a-row path = 2D in four clicks);
// anything else — a content-bearing slot, a non-container child, no selection —
// falls back to the existing append target so the implicit "replace" rule never
// fires on real content. Framework-free like insert/model.ts; every read is
// hostile-safe (a throw / non-map reads as "not a slot" → append).

import type { ReadFn } from '@shojiku/designer-core';
import { seqPosition } from '../tree/reorder';
import { isPlaceholderSlot } from './containerModel';
import { type InsertTarget, resolveInsertTarget } from './model';

const ITEMS_SUFFIX = '.items';

/** The picked shape lands here. `nest` REPLACES the placeholder slot at
 * `index` inside the container sequence `path` (insertItem + removeItem, one
 * batch); `append` inserts at the ordinary target (into the selected container,
 * after the selected item, or the flow body). */
export type ContainerInsertTarget =
  | { readonly mode: 'nest'; readonly path: string; readonly index: number }
  | { readonly mode: 'append'; readonly target: InsertTarget };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The container sequence + index a nest-into-slot would replace, or `null`
 * when the selection is not a placeholder slot directly inside a container: the
 * selection must be `<owner>.items[i]`, `<owner>` a `type: container`, and the
 * node at the selection an `isPlaceholderSlot`. A read throw is "no". */
function placeholderSlotAt(
  read: ReadFn,
  selection: string,
  defaultText: string,
): { readonly path: string; readonly index: number } | null {
  const pos = seqPosition(selection);
  if (pos === null || !pos.parent.endsWith(ITEMS_SUFFIX)) {
    return null;
  }
  const ownerPath = pos.parent.slice(0, -ITEMS_SUFFIX.length);
  try {
    if (record(read(ownerPath))?.type !== 'container') {
      return null;
    }
    if (!isPlaceholderSlot(read(selection), defaultText)) {
      return null;
    }
  } catch {
    return null;
  }
  return { path: pos.parent, index: pos.index };
}

/** Where a container-picker insert lands, from the shared selection. A
 * placeholder slot inside a container → `nest` (replace it); otherwise the
 * ordinary `resolveInsertTarget` append. */
export function resolveContainerInsert(
  read: ReadFn,
  selection: string | null,
  defaultText: string,
): ContainerInsertTarget {
  if (selection !== null) {
    const slot = placeholderSlotAt(read, selection, defaultText);
    if (slot !== null) {
      return { mode: 'nest', path: slot.path, index: slot.index };
    }
  }
  return { mode: 'append', target: resolveInsertTarget(read, selection) };
}
