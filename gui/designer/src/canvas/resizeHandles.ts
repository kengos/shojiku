// The resize-handle vocabulary: the eight handles the overlay paints on a
// selected movable box, the `box` keys each one's drag writes, and whether a
// given handle can write every key it touches back in its AUTHORED form. Pure
// and document-driven — a `"100%"` width refuses the horizontal handles while
// the vertical ones keep working, and a hostile document (a read throw) simply
// refuses.

import type { ReadFn } from '@shojiku/designer-core';
import { readLength } from './lengths';
import { record } from './manipulate';

/** The 8 resize handles, clockwise from the top-left corner. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The `box` keys a handle's drag writes. */
export function handleKeys(handle: Handle): readonly ('x' | 'y' | 'w' | 'h')[] {
  const keys: ('x' | 'y' | 'w' | 'h')[] = [];
  if (handle.includes('w')) {
    keys.push('x', 'w');
  } else if (handle.includes('e')) {
    keys.push('w');
  }
  if (handle.includes('n')) {
    keys.push('y', 'h');
  } else if (handle.includes('s')) {
    keys.push('h');
  }
  return keys;
}

/** Whether a handle's drag can write every key it touches in the authored
 * form (an absent key is writable — it authors a number). A `"100%"` width
 * refuses the horizontal handles while the vertical ones keep working. */
export function resizableHandle(read: ReadFn, path: string, handle: Handle): boolean {
  let child: Record<string, unknown> | undefined;
  try {
    child = record(read(path));
  } catch {
    return false;
  }
  const box = record(child?.box) ?? {};
  return handleKeys(handle).every((key) => {
    const value = box[key];
    return value === undefined || readLength(value) !== null;
  });
}
