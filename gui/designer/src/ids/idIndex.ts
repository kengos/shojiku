// The document's id namespace, read once per edit: every holder and every
// reference across the three sections (`walk.ts` decides what counts as
// either). The uniqueness check, the rename cascade and the copy renaming all
// consult THIS — one namespace, never an item-local view, because an id an
// edit invents must be free across every surface that resolves it.
//
// Read from the document TEXT (through the materialized `read`), never the box
// index: the namespace includes items that did not render, and a stale preview
// must not decide a write.

import type { ReadFn } from '@shojiku/designer-core';
import { record } from '../tree/nodeFields';
import { type IdHolder, type IdRef, newWalk, walkColumn, walkItem } from './walk';

export interface IdIndex {
  readonly holders: readonly IdHolder[];
  readonly refs: readonly IdRef[];
  /** A cap cut the walk short: the sets are partial, so no uniqueness or
   * cascade decision may rest on them. */
  readonly truncated: boolean;
}

const SECTION_NAMES = ['header', 'body', 'footer'] as const;

/** The whole document's namespace. An unreadable document (an alias bomb past
 * the materialization cap) reads as truncated — the field then refuses rather
 * than deciding from nothing. */
export function buildIdIndex(read: ReadFn): IdIndex {
  const walk = newWalk();
  let sections: Record<string, unknown> | undefined;
  try {
    sections = record(read('sections'));
  } catch {
    return { holders: [], refs: [], truncated: true };
  }
  for (const name of SECTION_NAMES) {
    const section = record(sections?.[name]);
    const items = section?.items;
    if (Array.isArray(items)) {
      for (let index = 0; index < items.length; index++) {
        walkItem(walk, `sections.${name}.items[${index}]`, items[index], 0);
      }
    }
  }
  return walk;
}

/** The namespace of ONE subtree (a node about to be copied, or a block about
 * to be inserted), with every path rooted at `at`. A path ending in a column
 * index is a column; anything else is an item. */
export function subtreeIndex(value: unknown, at: string): IdIndex {
  const walk = newWalk();
  if (/\.columns\[\d+\]$/.test(at)) {
    walkColumn(walk, at, value, 0);
  } else {
    walkItem(walk, at, value, 0);
  }
  return walk;
}

/** Every holder carrying `id`. */
export function holdersOf(index: IdIndex, id: string): readonly IdHolder[] {
  return index.holders.filter((holder) => holder.id === id);
}

/** Every reference naming `id`. */
export function refsTo(index: IdIndex, id: string): readonly IdRef[] {
  return index.refs.filter((ref) => ref.id === id);
}
