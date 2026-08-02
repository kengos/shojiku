// Where an iterable lands. Iterables are BODY-level structures (repeat_flow is
// flow-body-only; a container-targeted table stops paginating), so the generic
// insert-target rule in `model.ts` does not apply to them. Framework-free.

import { parsePath, type ReadFn } from '@shojiku/designer-core';
import { BODY_ITEMS_PATH } from './model';

/** Where an iterable lands: a selection inside the body inserts after its
 * top-level body item; anything else appends at the body end. A read failure
 * reads as an empty body (the op layer still validates). */
export function resolveIterableTarget(
  read: ReadFn,
  selection: string | null,
): { readonly path: string; readonly index: number } {
  if (selection !== null) {
    try {
      const segments = parsePath(selection);
      // `sections.body.items[i]…` — the top-level body index is segment 3.
      if (
        segments.length >= 4 &&
        segments[0].kind === 'key' &&
        segments[0].key === 'sections' &&
        segments[1].kind === 'key' &&
        segments[1].key === 'body' &&
        segments[2].kind === 'key' &&
        segments[2].key === 'items' &&
        segments[3].kind === 'index'
      ) {
        return { path: BODY_ITEMS_PATH, index: segments[3].index + 1 };
      }
    } catch {
      // Unparseable selection — fall through to the body append.
    }
  }
  let length = 0;
  try {
    const value = read(BODY_ITEMS_PATH);
    length = Array.isArray(value) ? value.length : 0;
  } catch {
    length = 0;
  }
  return { path: BODY_ITEMS_PATH, index: length };
}
