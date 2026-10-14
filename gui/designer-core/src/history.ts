// What the undo stack IS: one entry (text + the selection that was active then
// + the host's companion state, and what the step away from it did beside them)
// and the budget that bounds the stack. Pure — no document, no session — so the
// count/byte/floor branches are unit-testable with small fixtures instead of
// allocating ceiling-sized templates. The session that pushes and pops these
// lives in `editor.ts`.

/** One undo/redo history entry: the document text at that point, the selection
 * that was active then, and the host's COMPANION state then. Restoring an entry
 * restores all three, so the user's working position — and a document the host
 * keeps beside the template (the Designer's definitions edits) — travel with
 * undo/redo on ONE stack. */
export interface HistoryEntry<C = unknown, E = unknown> {
  readonly text: string;
  readonly selection: string | null;
  /** Opaque to the core; the host reads it back through `Editor.companion`. */
  readonly companion: C;
  /** What the step between this entry and its neighbour did OUTSIDE the
   * snapshots (the Designer re-keys the sample data); reported with the undo or
   * redo that crosses it. Absent for a plain template edit. */
  readonly effect?: E;
  /** The entry's weight in the byte budget: the text plus the serialized
   * companion and effect. */
  readonly bytes: number;
}

/** Build an entry, weighing it once (the companion is host data of unknown
 * size, so it counts toward the budget like the text does). */
export function historyEntry<C, E>(
  text: string,
  selection: string | null,
  companion: C,
  effect: E | undefined,
): HistoryEntry<C, E> {
  const bytes = text.length + JSON.stringify([companion, effect]).length;
  return effect === undefined
    ? { text, selection, companion, bytes }
    : { text, selection, companion, effect, bytes };
}

/** Maximum retained undo snapshots; older edits fall off the back. */
export const MAX_HISTORY = 100;

/** Byte budget for the retained undo snapshots. With the template-size cap
 * raisable toward the 8 MiB ceiling (inline images), a flat 100-snapshot count
 * could pin ~800 MB of text; this bounds the undo stack (its growth point) by
 * total size instead. The redo stack is conserved across undo/redo and cleared
 * on every fresh edit, so bounding undo bounds the whole session's footprint. */
export const MAX_HISTORY_BYTES = 32 * 1024 * 1024;

/** Trim an undo stack to at most `maxCount` entries AND `maxBytes` total,
 * dropping the OLDEST first. The newest entry is always retained even if it
 * alone exceeds the byte budget — a just-made edit must stay reversible. Byte
 * accounting is over each entry's `bytes` (text + companion + effect; the
 * selection path is negligible). Pure (a contiguous newest-suffix), so the
 * count/byte/floor branches are unit-testable with small fixtures instead of
 * allocating ceiling-sized templates. */
export function trimHistory<C, E>(
  undo: readonly HistoryEntry<C, E>[],
  maxCount: number,
  maxBytes: number,
): HistoryEntry<C, E>[] {
  const kept: HistoryEntry<C, E>[] = [];
  let bytes = 0;
  for (let i = undo.length - 1; i >= 0; i--) {
    const entry = undo[i];
    // The newest is unconditional (the ≥1 floor); older ones ride both budgets.
    if (kept.length === 0 || (kept.length < maxCount && bytes + entry.bytes <= maxBytes)) {
      kept.push(entry);
      bytes += entry.bytes;
    } else {
      break;
    }
  }
  kept.reverse();
  return kept;
}
