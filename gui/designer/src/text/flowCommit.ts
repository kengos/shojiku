// What a flow-surface commit authors — ONE batch, so one undo step, whichever
// item the surface opened over:
//   - a PLAIN `text:` item → `plainFlowCommitOps` (stays `text:` while nothing is
//     marked; creates `spans:` once something is);
//   - an item that already has `spans:` → the run plan over its fragments.
// Split from `hooks/useInlineEdit` so the hook keeps the editing STATE and this
// keeps the write, which is pure and testable without a Designer.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { plainFlowCommitOps } from '../panel/spanConversion';
import { spanCommitOps } from '../panel/spanOps';
import { declarationBatch } from './declCommit';
import type { PendingDecl } from './declModel';
import { otherSurfaceNames, readItem } from './declModel';
import { planRuns } from './runIdentity';
import type { SerializedRun } from './runSerialize';
import type { RunView } from './spanRuns';

/** The flow surface's text as ONE string — what the declaration model reads a
 * surface's content as. A `data:` fragment contributes nothing: its binding is
 * not an interpolation and no declaration can be minted for it. */
function joinRuns(runs: readonly { readonly kind: string; readonly content: string }[]): string {
  return runs.map((run) => (run.kind === 'text' ? run.content : '')).join('');
}

/** The ONE batch a commit over an item that already has `spans:` applies.
 *
 * The fragments and the declarations their chips staged land together: one
 * undo step, and never a declaration without the text that uses it.
 *
 * The prune is told `otherSurfaceNames`, which INCLUDES the spans — so a name
 * any fragment still references survives. That is deliberately conservative:
 * the set is read from the PRE-commit document, so a name this very edit
 * orphaned still looks used and is kept. An unused declaration is a harmless
 * leftover; a pruned one that another fragment still names is a dangling
 * reference, and only one of those is a bug. */
function spansCommitBatch(
  read: ReadFn,
  path: string,
  seeded: readonly RunView[],
  runs: readonly SerializedRun[],
  pending: readonly PendingDecl[],
): readonly Op[] {
  return [
    ...spanCommitOps(read, path, planRuns(seeded, runs)),
    ...declarationBatch({
      read,
      path,
      oldText: joinRuns(seeded),
      newText: joinRuns(runs),
      pending,
      others: otherSurfaceNames(readItem(read, path)),
    }),
  ];
}

export interface FlowCommitInput {
  readonly read: ReadFn;
  readonly path: string;
  /** Which item the surface opened over (`useInlineEdit`'s `editing.origin`). */
  readonly origin: 'plain' | 'spans';
  /** The `text:` a plain item was seeded from. */
  readonly oldText: string;
  /** The runs the surface was seeded from. */
  readonly seeded: readonly RunView[];
  /** The runs the reader left. */
  readonly runs: readonly SerializedRun[];
  readonly pending: readonly PendingDecl[];
}

/** The ONE batch the commit applies; empty when nothing changed, `null` when
 * the edit is refused before any batch is built (see `plainFlowCommitOps`). */
export function flowCommitOps(input: FlowCommitInput): readonly Op[] | null {
  const { read, path, origin, oldText, seeded, runs, pending } = input;
  return origin === 'plain'
    ? plainFlowCommitOps({ read, path, oldText, runs, pending })
    : spansCommitBatch(read, path, seeded, runs, pending);
}
