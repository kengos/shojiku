// The WRITE side of `link: { url }` — what one commit of the link field
// authors, as ONE batch (`applyAll` = one undo step).
//
// Two things it must not do, both of which are silent when they go wrong:
//
//   * `removeKey` on an ABSENT key returns `key_not_found`, and `applyAll`
//     re-parses the pre-batch snapshot on the first failing op — so an
//     unguarded clear turns every other op in the batch into a no-op with
//     nothing reporting it.
//   * A bare tab-through must author NOTHING.
//
// ONE guard answers both, which is why there is no separate presence flag: the
// changed-check runs first, so the clear arm is reached only when the CURRENT
// url is non-empty — and a non-empty current url can only have come from a
// `link.url` the document carries. A presence flag beside that guard would have
// an arm nothing can reach.
//
// The declaration half is not this module's: it is `text/declCommit`'s
// `declarationBatch`, shared with the chip editor so there is one prune rule.
// What IS this module's is telling it the right OTHER-surfaces set — for a link
// edit that is `linkSurfaceNames`, the item's `text:` and spans, never
// `otherSurfaceNames`, which returns the link URL being edited.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { declarationBatch } from '../text/declCommit';
import { linkSurfaceNames, type PendingDecl, readItem } from '../text/declModel';

/** The ops that move the `link:` key itself. Empty when nothing changed. The
 * URL is TRIMMED, which is what the engine emits (`check_link_url` returns the
 * trimmed form) — a normalisation, which is exactly the case the field's reseed
 * nonce exists for. */
export function linkWireOps(path: string, next: string, currentUrl: string): readonly Op[] {
  const url = next.trim();
  if (url === currentUrl.trim()) {
    return [];
  }
  if (url === '') {
    return [{ op: 'removeKey', path, keys: ['link'] }];
  }
  return [{ op: 'setScalar', path, keys: ['link', 'url'], value: url }];
}

/** What one link-field commit writes. */
export interface LinkCommitInput {
  readonly read: ReadFn;
  readonly path: string;
  /** The URL the field opened with — its names are what a prune may drop. */
  readonly currentUrl: string;
  readonly next: string;
  /** Declarations the field's insert menu staged, applied only alongside the
   * URL that references them (a cancelled edit leaves no orphan). */
  readonly pending: readonly PendingDecl[];
}

/** The ONE batch: the `link:` write, the staged declarations the new URL
 * actually references, and the removal of one this edit orphaned.
 *
 * An unchanged URL returns `[]` outright — no undo step, and nothing for the
 * declaration half to do either, since a staged declaration the text no longer
 * references is skipped and a prune needs the two texts to differ. */
export function linkCommitOps(input: LinkCommitInput): readonly Op[] {
  const { read, path, currentUrl, next, pending } = input;
  const wire = linkWireOps(path, next, currentUrl);
  if (wire.length === 0) {
    return [];
  }
  return [
    ...wire,
    ...declarationBatch({
      read,
      path,
      oldText: currentUrl,
      newText: next.trim(),
      pending,
      others: linkSurfaceNames(readItem(read, path)),
    }),
  ];
}
