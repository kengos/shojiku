// What the editing surfaces treat as the CURRENT SUBJECT: the selected node, or —
// when there is none — the whole document. The property panel shows the
// document card, the layer tree marks its 「whole document」 root row current,
// and the canvas multi-selection stands down, all on this one answer. Three
// surfaces each deciding it for themselves is how the panel came to say
// "nothing is selected" while the tree marked the document and the toolbar
// counted two items.
//
// A selection can outlive its node (an edit elsewhere removed or moved it), so a
// path that no longer reads is the document too, not a subject nobody can show.

import type { ReadFn } from '@shojiku/designer-core';

/** A selected node that still exists, with the value it read to — handed back so
 * a caller that renders it does not read the same path twice. */
export interface Subject {
  readonly path: string;
  readonly node: unknown;
}

/** The selected node while it still reads; `null` — the document is the subject —
 * when nothing is selected, the node is gone, or the read throws. Every surface
 * that shows or acts on "the selected item" reads the selection through this;
 * the delete/duplicate actions deliberately do not, so a node a hostile document
 * refuses to read can still be removed. */
export function readSubject(read: ReadFn, selection: string | null): Subject | null {
  if (selection === null) {
    return null;
  }
  try {
    const node = read(selection);
    return node === undefined ? null : { path: selection, node };
  } catch {
    return null;
  }
}
