// The WRITE side of a FRAGMENT's link (`spans[i].link.url`), and of clearing
// the content key a spans-carrying item's `text:`/`data:` has become.
//
// It composes the two existing halves rather than branching either, because the
// two halves address DIFFERENT nodes: the `link:` write lands on the span
// (`<item>.spans[i]`), while the declarations it may reference live in the
// ITEM's `bindings:` map. `panel/linkOps`'s `linkCommitOps` passes one `path`
// to both, which is right for the item surface and wrong here.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { declarationBatch } from '../text/declCommit';
import { type PendingDecl, readItem, spanLinkSurfaceNames } from '../text/declModel';
import { linkWireOps } from './linkOps';

/** The structural path of one fragment — the grammar `designer-core/path.ts`
 * parses and the engine's box index shares. */
export function spanPath(itemPath: string, index: number): string {
  return `${itemPath}.spans[${index}]`;
}

/** What one fragment-link commit writes. */
export interface SpanLinkCommitInput {
  readonly read: ReadFn;
  /** The TEXT ITEM's path — where `bindings:` lives. */
  readonly itemPath: string;
  /** The fragment's WIRE index (`SpanView.index`), not its row position. */
  readonly index: number;
  /** The URL the field opened with — its names are what a prune may drop. */
  readonly currentUrl: string;
  readonly next: string;
  readonly pending: readonly PendingDecl[];
}

/** The ONE batch a fragment-link commit applies: the `link:` write on the span,
 * plus the shared declaration batch on the item. An unchanged URL returns `[]`
 * outright — no undo step, and nothing for the declaration half to do either
 * (`panel/linkOps` states the reasoning; this surface inherits it, including
 * that `applyAll([])` reports ok and bumps the revision). */
export function spanLinkCommitOps(input: SpanLinkCommitInput): readonly Op[] {
  const { read, itemPath, index, currentUrl, next, pending } = input;
  const wire = linkWireOps(spanPath(itemPath, index), next, currentUrl);
  if (wire.length === 0) {
    return [];
  }
  return [
    ...wire,
    ...declarationBatch({
      read,
      path: itemPath,
      oldText: currentUrl,
      newText: next.trim(),
      pending,
      others: spanLinkSurfaceNames(readItem(read, itemPath), index),
    }),
  ];
}

/** Removing the content key a spans-carrying item still authors. `spans` wins
 * over both, so neither is drawn — but with the content-mode pair no longer on
 * screen for such an item, this is the only way left to clear one, and leaving
 * no way is how removing a control creates a dead end.
 *
 * Both removals are guarded by PRESENCE, and they have to be: `removeKey` on an
 * absent key returns `key_not_found`, and `applyAll` re-parses the pre-batch
 * snapshot on the first failing op — so an unguarded pair would make clearing a
 * lone `text:` a silent no-op whenever no `data:` was there beside it. */
export function clearIgnoredContentOps(
  path: string,
  hasText: boolean,
  hasData: boolean,
): readonly Op[] {
  const ops: Op[] = [];
  if (hasText) {
    ops.push({ op: 'removeKey', path, keys: ['text'] });
  }
  if (hasData) {
    ops.push({ op: 'removeKey', path, keys: ['data'] });
  }
  return ops;
}
