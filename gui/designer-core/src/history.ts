// What the undo stack IS: one entry (text + the selection that was active then)
// and the budget that bounds the stack. Pure — no document, no session — so the
// count/byte/floor branches are unit-testable with small fixtures instead of
// allocating ceiling-sized templates. The session that pushes and pops these
// lives in `editor.ts`.

/** One undo/redo history entry: the document text at that point plus the
 * selection that was active then. Restoring an entry restores BOTH, so the
 * user's working position travels with undo/redo. */
export interface HistoryEntry {
  readonly text: string;
  readonly selection: string | null;
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
 * accounting is over the entry TEXT (the selection path is negligible). Pure
 * (a contiguous newest-suffix), so the count/byte/floor branches are unit-
 * testable with small fixtures instead of allocating ceiling-sized templates. */
export function trimHistory(
  undo: readonly HistoryEntry[],
  maxCount: number,
  maxBytes: number,
): HistoryEntry[] {
  const kept: HistoryEntry[] = [];
  let bytes = 0;
  for (let i = undo.length - 1; i >= 0; i--) {
    const entry = undo[i];
    // The newest is unconditional (the ≥1 floor); older ones ride both budgets.
    if (kept.length === 0 || (kept.length < maxCount && bytes + entry.text.length <= maxBytes)) {
      kept.push(entry);
      bytes += entry.text.length;
    } else {
      break;
    }
  }
  kept.reverse();
  return kept;
}
