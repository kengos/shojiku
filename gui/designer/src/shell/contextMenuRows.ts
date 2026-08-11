// Which rows the right-click menu offers for one path, in menu order. Pure: it
// answers with row KINDS, so nothing here knows a catalog string or an op —
// `BlockSurfaces` turns a kind into a label and an action. That keeps the shell
// a shell and puts the applicability rules under a direct unit test.
//
// A row that does not apply is ABSENT, never disabled — the toolbar's "shown
// when usable" rule, which is what the wrap and save-block rows already did.
//
// Order mirrors the editors this Designer is modelled on: the basic operations
// first, then the structural one, then formatting, then the export-shaped tail.

import type { ReadFn, SnippetValue } from '@shojiku/designer-core';
import { blockFromNode } from '../insert/blockModel';
import { isWrappablePath } from '../insert/wrap';
import { BORDERABLE_TYPES } from '../panel/borderTypes';
import { hasCapability } from '../panel/itemPanelProps';
import { type ItemView, readItemView } from '../panel/itemView';
import { seqPosition } from '../tree/reorder';

/** One row. The save-block row CARRIES its snippet: the value is captured while
 * the model has narrowed it to non-null, so the shell needs no re-read at click
 * time and no null check that could never fire. */
export type ContextRow =
  | { readonly kind: 'duplicate' | 'delete' | 'wrap' | 'border' }
  | { readonly kind: 'saveBlock'; readonly block: SnippetValue };

export interface ContextRowsInput {
  /** The node at `path`, already read through `readNodeAt`. */
  readonly node: unknown;
  readonly path: string;
  /** Whether the host wired the reusable-block feature at all. */
  readonly blockArmed: boolean;
  readonly capabilities: readonly string[] | undefined;
}

/** The node at `path`, or `undefined` when it cannot be read — a hostile
 * subtree (an alias bomb) throws, and a menu is never a reason to crash. */
export function readNodeAt(read: ReadFn, path: string): unknown {
  try {
    return read(path);
  } catch {
    return undefined;
  }
}

/** The node's view when the border row/popover applies to it — a type that can
 * carry a border, on an engine that has borders — else `null`. The ONE rule,
 * shared by the row and the popover it opens, so the two cannot disagree; the
 * popover takes the view from here rather than re-deriving it. */
export function borderableView(
  node: unknown,
  capabilities: readonly string[] | undefined,
): ItemView | null {
  if (!hasCapability(capabilities, 'style.border')) {
    return null;
  }
  const view = readItemView(node);
  // A real `Set`, never a plain-object table: `type` is document-derived, so a
  // prototype name (`constructor`) must miss rather than inherit a hit.
  return view !== null && BORDERABLE_TYPES.has(view.type) ? view : null;
}

export function contextMenuRows(input: ContextRowsInput): readonly ContextRow[] {
  const { node, path, blockArmed, capabilities } = input;
  const rows: ContextRow[] = [];
  // Duplicate/delete address a SEQUENCE entry — the same gate the Edit menu's
  // own rows use, so a section root or the document row offers neither.
  if (seqPosition(path) !== null) {
    rows.push({ kind: 'duplicate' }, { kind: 'delete' });
  }
  if (isWrappablePath(path)) {
    rows.push({ kind: 'wrap' });
  }
  if (borderableView(node, capabilities) !== null) {
    rows.push({ kind: 'border' });
  }
  const block = blockArmed ? blockFromNode(node) : null;
  if (block !== null) {
    rows.push({ kind: 'saveBlock', block });
  }
  return rows;
}
