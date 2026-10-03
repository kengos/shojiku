// A panel-local undo ring for the data-item editor's DEFINITION edits. The
// definitions live OUTSIDE both the template's ⌘Z stack AND the sample-data undo
// ring — one undo stack spanning separate documents would corrupt trust (a
// revert meant for definitions must never touch the template or the sample data,
// or vice versa), so this is the definitions' OWN history: snapshots of the
// coalesced `defsEdits` op list taken BEFORE each edit, capped by count and total
// bytes. A rename or delete also carries a COMPANION — what reverting it must do
// to the template and the sample data, which that one action changed too (one
// definitions undo reverts all three; the template half is re-applied as a NEW
// forward batch, never popped off the template's own stack). There is no redo — a fresh edit after an undo forks (v1). It
// deliberately mirrors `sample/history.ts`; the two stay parallel because their
// undo contexts are different documents (they may also diverge — e.g. defs redo
// later).

import type { Op } from '@shojiku/designer-core';
import type { RemovedValue } from '../sample/rekey';

/** What undoing a rename / delete does beyond restoring the op list. A rename
 * names the node where it NOW is and the name to give back (the reverse
 * cascade is planned against the template and samples as they are at undo
 * time); a delete carries, per variant, the values it removed and where. */
export type DefsCompanion =
  | { readonly kind: 'rename'; readonly keysPath: readonly string[]; readonly name: string }
  | {
      readonly kind: 'delete';
      /** The deleted node's data name (what the undo control names). */
      readonly name: string;
      readonly variants: readonly {
        readonly id: string;
        readonly removed: readonly RemovedValue[];
      }[];
    };

/** One undo target: the op list to restore, and its companion if any. */
export interface DefsHistoryEntry {
  readonly ops: readonly Op[];
  readonly companion?: DefsCompanion;
}

/** The panel-local definitions-undo history, oldest → newest. Pure data
 * (serializable), never React state internals. */
export interface DefsHistory {
  readonly entries: readonly DefsHistoryEntry[];
}

export const EMPTY_DEFS_HISTORY: DefsHistory = { entries: [] };

/** Retained prior-snapshot count. */
export const MAX_DEFS_HISTORY = 20;
/** Byte budget across the retained snapshots (a hostile definition edit with a
 * multi-MiB description must not let the ring pin unbounded memory). */
export const MAX_DEFS_HISTORY_BYTES = 4 * 1_048_576;

/** An entry's byte weight — its serialized ops and companion (they carry the
 * only user-influenced strings). */
function snapshotBytes(snapshot: DefsHistoryEntry): number {
  return JSON.stringify(snapshot).length;
}

/** Drop the OLDEST snapshots until the ring is within both budgets. Newest-first
 * accounting keeps the most recent undo targets. */
function trim(entries: readonly DefsHistoryEntry[]): DefsHistoryEntry[] {
  const kept: DefsHistoryEntry[] = [];
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

/** Record `ops` (the pre-edit coalesced op list) as an undo target, with the
 * companion a rename / delete carries. */
export function pushDefsHistory(
  history: DefsHistory,
  ops: readonly Op[],
  companion?: DefsCompanion,
): DefsHistory {
  const entry: DefsHistoryEntry = companion === undefined ? { ops } : { ops, companion };
  return { entries: trim([...history.entries, entry]) };
}

/** The newest undo target, without taking it. */
export function peekDefsHistory(history: DefsHistory): DefsHistoryEntry | null {
  return history.entries[history.entries.length - 1] ?? null;
}

/** Pop the newest undo target, or `null` when empty. */
export function popDefsHistory(
  history: DefsHistory,
): { readonly entry: DefsHistoryEntry; readonly history: DefsHistory } | null {
  const { entries } = history;
  if (entries.length === 0) {
    return null;
  }
  return {
    entry: entries[entries.length - 1],
    history: { entries: entries.slice(0, -1) },
  };
}

/** Whether an undo target exists. */
export function canUndoDefs(history: DefsHistory): boolean {
  return history.entries.length > 0;
}
