// Where an insert lands: the document read contract the target rules consult,
// and the resolution from the shared selection to an (item-list path, index)
// pair. Framework-free (like panel/model.ts) so every rule is exhaustively
// unit-testable. Every insert is a designer-core `insertItem` op (AI parity) —
// this module only decides WHERE; WHAT the menu offers is `insertMenu.ts` and
// what each kind inserts is `insertSnippet.ts`.

import { formatPath, parsePath, type ReadFn } from '@shojiku/designer-core';

export interface InsertTarget {
  readonly path: string;
  readonly index: number;
}

/** The default target: the flow body's item list. */
export const BODY_ITEMS_PATH = 'sections.body.items';

/** The sequence length at `path`, 0 when missing or not a list. A `read`
 * throw (a hostile subtree the materializer refuses) also reads as 0 — the
 * op layer still validates the real insert. */
function seqLength(read: ReadFn, path: string): number {
  try {
    const value = read(path);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

/** Whether the selected node itself holds an `items` list (a container-like
 * target the insert goes INTO). A read failure reads as "no". */
function ownItemsLength(read: ReadFn, path: string): number | null {
  try {
    const value = read(path);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const items = (value as Record<string, unknown>).items;
    return Array.isArray(items) ? items.length : null;
  } catch {
    return null;
  }
}

/** Resolve where an insert lands, from the shared selection:
 *
 * 1. the selected node HAS an `items` list → append inside it;
 * 2. otherwise, the nearest enclosing `items`-keyed sequence on the selection
 *    path → right after that ancestor (a table item inserts after the table,
 *    never into `columns`; a cell selection walks up to its item list);
 * 3. no selection / nothing resolvable → append to the flow body.
 */
export function resolveInsertTarget(read: ReadFn, selection: string | null): InsertTarget {
  if (selection !== null) {
    const own = ownItemsLength(read, selection);
    if (own !== null) {
      return { path: `${selection}.items`, index: own };
    }
    const segments = parsePath(selection);
    for (let i = segments.length - 1; i > 0; i--) {
      const segment = segments[i];
      const parent = segments[i - 1];
      if (segment.kind === 'index' && parent.kind === 'key' && parent.key === 'items') {
        return { path: formatPath(segments.slice(0, i)), index: segment.index + 1 };
      }
    }
  }
  return { path: BODY_ITEMS_PATH, index: seqLength(read, BODY_ITEMS_PATH) };
}

/** Whether the flow body has no items — the blank-start empty state the
 * canvas guides out of. A read failure reads as NON-empty: never overlay a
 * document we cannot understand. */
export function hasNoBodyItems(read: ReadFn): boolean {
  try {
    const value = read(BODY_ITEMS_PATH);
    return value === undefined || (Array.isArray(value) && value.length === 0);
  } catch {
    return false;
  }
}
