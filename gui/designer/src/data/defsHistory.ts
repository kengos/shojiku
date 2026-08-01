// A panel-local undo ring for the data-item editor's DEFINITION edits. The
// definitions live OUTSIDE both the template's ⌘Z stack AND the sample-data undo
// ring — one undo stack spanning separate documents would corrupt trust (a
// revert meant for definitions must never touch the template or the sample data,
// or vice versa), so this is the definitions' OWN history: snapshots of the
// coalesced `defsEdits` op list taken BEFORE each edit, capped by count and total
// bytes. There is no redo — a fresh edit after an undo forks (v1). It
// deliberately mirrors `sample/history.ts`; the two stay parallel because their
// undo contexts are different documents (they may also diverge — e.g. defs redo
// later).

import type { Op } from '@shojiku/designer-core';

/** The panel-local definitions-undo history: prior coalesced op-list snapshots,
 * oldest → newest. Pure data (serializable), never React state internals. */
export interface DefsHistory {
  readonly entries: readonly (readonly Op[])[];
}

export const EMPTY_DEFS_HISTORY: DefsHistory = { entries: [] };

/** Retained prior-snapshot count. */
export const MAX_DEFS_HISTORY = 20;
/** Byte budget across the retained snapshots (a hostile definition edit with a
 * multi-MiB description must not let the ring pin unbounded memory). */
export const MAX_DEFS_HISTORY_BYTES = 4 * 1_048_576;

/** A snapshot's byte weight — its serialized op list (the ops carry the only
 * user-influenced strings). */
function snapshotBytes(snapshot: readonly Op[]): number {
  return JSON.stringify(snapshot).length;
}

/** Drop the OLDEST snapshots until the ring is within both budgets. Newest-first
 * accounting keeps the most recent undo targets. */
function trim(entries: readonly (readonly Op[])[]): (readonly Op[])[] {
  const kept: (readonly Op[])[] = [];
  let bytes = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const size = snapshotBytes(entry);
    // The newest is retained unconditionally (a just-made edit must stay
    // undoable even if it alone exceeds the budget); older ones ride both caps.
    if (
      kept.length === 0 ||
      (kept.length < MAX_DEFS_HISTORY && bytes + size <= MAX_DEFS_HISTORY_BYTES)
    ) {
      kept.push(entry);
      bytes += size;
    } else {
      break;
    }
  }
  kept.reverse();
  return kept;
}

/** Record `snapshot` (the pre-edit coalesced op list) as an undo target. */
export function pushDefsHistory(history: DefsHistory, snapshot: readonly Op[]): DefsHistory {
  return { entries: trim([...history.entries, snapshot]) };
}

/** Pop the newest undo target (the op list to restore), or `null` when empty. */
export function popDefsHistory(
  history: DefsHistory,
): { readonly snapshot: readonly Op[]; readonly history: DefsHistory } | null {
  const { entries } = history;
  if (entries.length === 0) {
    return null;
  }
  return {
    snapshot: entries[entries.length - 1],
    history: { entries: entries.slice(0, -1) },
  };
}

/** Whether an undo target exists. */
export function canUndoDefs(history: DefsHistory): boolean {
  return history.entries.length > 0;
}
