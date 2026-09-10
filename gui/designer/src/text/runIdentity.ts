// What the edit actually TOUCHED — the user's round-trip decision made into a
// predicate: "rewrite only the touched range", so a document with eighteen
// hand-authored fragments comes back with the seventeen it did not edit still
// on their original YAML nodes.
//
// The mechanism is provenance, not identity. Measured in a real browser: an
// untouched run keeps its `data-sj-run` attribute and its text through typing
// anywhere else in the surface, while a split leaves TWO elements carrying the
// same attribute. So "appears exactly once and still says what it said" is a
// sound witness for untouched, and everything else is the touched range.
//
// A changed fragment is UPDATED IN PLACE rather than removed and re-inserted.
// That is not an optimization: a fragment's `styleNames:` and `link:` are keys
// this surface does not edit, and a re-insert would have to reconstruct them
// from a model that never carried them. Writing only the keys that changed
// leaves the rest of the node alone by construction.

import type { SerializedRun } from './runSerialize';
import { type RunView, sameMarks } from './spanRuns';

/** One fragment's fate. `keep` authors nothing at all. */
export type RunPlanEntry =
  | { readonly op: 'keep'; readonly sourceIndex: number }
  | { readonly op: 'update'; readonly sourceIndex: number; readonly run: SerializedRun }
  /** A fragment the edit created. `inheritFrom` is the source fragment it was
   * split OUT of, when there is one — the keys this surface does not edit are
   * copied from it, so splitting a linked fragment leaves both halves linked,
   * which is what every editor a reader has met does. */
  | { readonly op: 'insert'; readonly run: SerializedRun; readonly inheritFrom: number | null };

export interface RunPlan {
  /** In TARGET order — the order the fragments must end up in. */
  readonly entries: readonly RunPlanEntry[];
  /** Source indices no surviving run stands on, ascending. */
  readonly removed: readonly number[];
}

function unchanged(before: RunView, after: SerializedRun): boolean {
  return (
    before.kind === after.kind &&
    before.content === after.content &&
    before.linked === after.linked &&
    sameMarks(before.marks, after.marks)
  );
}

/** The source index this target run may STAND ON, or `null` when it must be a
 * fresh node. A duplicated index lets its FIRST bearer keep the node (so a
 * split's leading half stays put and only the tail is new), and refuses the
 * rest. An index that would go BACKWARDS is refused too: the ops address
 * positions, and a retained node moving earlier is a reorder this surface
 * cannot produce and must not silently mis-encode. */
function claimFor(
  run: SerializedRun,
  before: readonly RunView[],
  highWater: number,
): number | null {
  const index = run.sourceIndex;
  // One test settles BOTH refusals, which is why there is no second bookkeeping
  // set beside it: a split's later halves repeat an index already consumed, and
  // a reordered run names one below the last consumed. Either way the index is
  // not strictly ahead of the high-water mark, and the run needs a fresh node.
  if (index === null || index <= highWater) {
    return null;
  }
  const source = before.find((candidate) => candidate.index === index);
  return source !== undefined && source.kind === run.kind ? index : null;
}

/** A run with no content at all. Only a TEXT fragment can be in this state: a
 * bound one carries a binding key, and the flow cannot retype it. */
function emptied(run: SerializedRun): boolean {
  return run.kind === 'text' && run.content === '';
}

/** Was the fragment at `index` ALREADY empty when the surface was seeded?
 *
 * This is the whole distinction the removal rests on. The engine reports
 * `empty_span` for a fragment carrying neither `text` nor `data` — a document
 * may hold one deliberately — while a fragment the reader empties is written
 * `text: ""`, which that predicate does not match and nothing reports. So the
 * first must survive a commit untouched and the second must not survive at all,
 * and only the seed can tell them apart. */
function wasEmpty(before: readonly RunView[], index: number): boolean {
  const source = before.find((candidate) => candidate.index === index);
  return source !== undefined && source.kind === 'text' && source.content === '';
}

/** Classify every fragment the surface now holds against the ones it was seeded
 * from. Pure — the ops are built from this, one layer up, so the decision and
 * its encoding can be tested apart. */
export function planRuns(before: readonly RunView[], after: readonly SerializedRun[]): RunPlan {
  const taken = new Set<number>();
  const entries: RunPlanEntry[] = [];
  let highWater = -1;
  for (const run of after) {
    const claim = claimFor(run, before, highWater);
    if (claim === null) {
      // A fragment created and emptied within one edit has nothing to preserve
      // and is dropped before it is ever inserted.
      if (!emptied(run)) {
        entries.push({ op: 'insert', run, inheritFrom: run.sourceIndex });
      }
      continue;
    }
    // The reader deleted this fragment's words, so they deleted the fragment —
    // which is what every editor they have met does. Claiming nothing leaves
    // the index out of `taken`, and the removal below follows from that.
    //
    // Deleting the words is the only way to reach it: a fragment that was
    // ALREADY empty when seeded is not "emptied" and is kept, because a
    // document may legitimately carry `{}` — `runSerialize` preserves it on
    // purpose, and dropping it here would delete a node its author wrote.
    if (emptied(run) && !wasEmpty(before, claim)) {
      continue;
    }
    taken.add(claim);
    highWater = claim;
    const source = before.find((candidate) => candidate.index === claim);
    /* v8 ignore next 3 -- `claimFor` returned this index only after finding the
       source, so the lookup cannot miss; kept as a total-function guard. */
    if (source === undefined) {
      continue;
    }
    entries.push(
      unchanged(source, run)
        ? { op: 'keep', sourceIndex: claim }
        : { op: 'update', sourceIndex: claim, run },
    );
  }
  const removed = before
    .map((run) => run.index)
    .filter((index) => !taken.has(index))
    .sort((a, b) => a - b);
  return { entries, removed };
}

// There is deliberately no `planIsEmpty` here. "Did this edit author anything?"
// is answered one layer up, by the LENGTH OF THE BATCH — which also counts the
// declaration ops a chip insert stages, and so is the only form of the question
// that is complete. A predicate over the plan alone would answer "nothing
// changed" for an edit that minted a declaration.
