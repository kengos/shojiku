// Assembling ONE batch from a run plan — the encoding half of the user's
// round-trip decision. A `keep` entry authors nothing at all, which is what
// makes "a document with eighteen fragments comes back with the seventeen it
// did not edit untouched" true of the FILE and not merely of the model.
//
// The order is forced, and it is the whole subtlety of this file:
//
//   1. UPDATES first, addressing ORIGINAL indices — valid only while the
//      sequence still has its original shape.
//   2. REMOVALS next, DESCENDING, so each removal leaves every lower index
//      still meaning what it meant.
//   3. INSERTS last, ASCENDING in target order. After the removals the sequence
//      holds exactly the kept and updated fragments in order, so walking the
//      plan left to right puts entry `i` at index `i` — each insert shifts only
//      the entries after it, which have not been placed yet.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readItem } from '../text/declModel';
import type { RunPlan } from '../text/runIdentity';
import type { SerializedRun } from '../text/runSerialize';
import { display, record } from './itemView';
import { spanPath } from './spanLinkOps';
import { inheritedKeys, markStyleOps, markStyleValue, type SnippetMap } from './spanWire';

/** The item's raw `spans` sequence, or `[]` for anything else. Hostile shapes
 * degrade the same way `narrowSpans` degrades them — a template is untrusted,
 * and a commit over a malformed one must author nothing rather than throw. */
function rawSpans(read: ReadFn, itemPath: string): readonly unknown[] {
  const spans = readItem(read, itemPath)?.spans;
  return Array.isArray(spans) ? spans : [];
}

/** The content key one fragment writes. A `bound` fragment has none: its key is
 * atomic in the flow — the reader can delete the whole thing but cannot retype
 * it — so the only surface that changes a binding is the panel inspector. */
function contentValue(run: SerializedRun): SnippetMap {
  return run.kind === 'bound' ? { data: { key: run.content } } : { text: run.content };
}

function updateOps(path: string, source: unknown, run: SerializedRun): readonly Op[] {
  const span = record(source);
  const style = markStyleOps(path, span?.style, run.marks);
  // A bound fragment's key cannot change here (see `contentValue`), so only a
  // text fragment can have a content write at all — and it gets one only when
  // the text actually MOVED. A fragment whose mark changed and whose words did
  // not must leave its `text:` node alone, or "rewrite only the touched range"
  // would still rewrite the one thing the reader can see.
  //
  // It is a `setScalar` rather than a guarded removal, because an emptied
  // fragment stays a TEXT fragment the reader can type back into.
  if (run.kind === 'bound' || display(span?.text) === run.content) {
    return style;
  }
  return [{ op: 'setScalar', path, keys: ['text'], value: run.content }, ...style];
}

function insertValue(run: SerializedRun, source: unknown): SnippetMap {
  const style = markStyleValue(run.marks);
  return {
    ...contentValue(run),
    ...inheritedKeys(source),
    ...(style === undefined ? {} : { style }),
  };
}

/** The ONE batch a flow-surface commit applies. Empty when the plan authors
 * nothing — `applyAll([])` reports ok and bumps the revision, which would put a
 * step on the undo stack for an edit that changed nothing. */
export function spanCommitOps(read: ReadFn, itemPath: string, plan: RunPlan): readonly Op[] {
  const spans = rawSpans(read, itemPath);
  const seqPath = `${itemPath}.spans`;
  const ops: Op[] = [];
  for (const entry of plan.entries) {
    if (entry.op === 'update') {
      ops.push(
        ...updateOps(spanPath(itemPath, entry.sourceIndex), spans[entry.sourceIndex], entry.run),
      );
    }
  }
  // Positions are tracked against a SIMULATED sequence rather than counted off
  // the plan, because the two can disagree: `narrowSpans` skips a malformed
  // entry while keeping its neighbours' wire indices, so a document with one
  // has more elements than the plan has entries. Counting entries would then
  // aim every insert at the wrong slot — the skipped element is invisible to
  // the plan but very much present in the file.
  const live: number[] = spans.map((_, index) => index);
  for (const index of [...plan.removed].sort((a, b) => b - a)) {
    const at = live.indexOf(index);
    /* v8 ignore next 3 -- reachable only when the DOCUMENT moved under an open
       editor (an undo while editing): the plan's indices were read when the
       surface was seeded, `spans` here is read at commit time, and the two can
       then disagree. Skipping the removal is the conservative arm — it leaves a
       fragment standing rather than deleting whichever one now occupies the
       slot. The plain text editor has the same exposure and simply overwrites,
       so this is not a new class of hazard, only a guarded one. */
    if (at === -1) {
      continue;
    }
    live.splice(at, 1);
    ops.push({ op: 'removeItem', path: seqPath, index: at });
  }
  let cursor = 0;
  for (const entry of plan.entries) {
    if (entry.op !== 'insert') {
      cursor = live.indexOf(entry.sourceIndex) + 1;
      continue;
    }
    const source = entry.inheritFrom === null ? undefined : spans[entry.inheritFrom];
    ops.push({
      op: 'insertItem',
      path: seqPath,
      index: cursor,
      value: insertValue(entry.run, source),
    });
    // `-1` is a slot no wire index can name, so a later `indexOf` for a kept
    // fragment cannot match one of these placeholders.
    live.splice(cursor, 0, -1);
    cursor += 1;
  }
  return ops;
}
