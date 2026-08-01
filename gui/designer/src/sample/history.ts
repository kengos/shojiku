// A small, session-local undo ring for the sample-data panel. Params live
// OUTSIDE the template's undo stack (one undo stack over two documents would
// corrupt trust — a ⌘Z meant for the template must never revert sample data, or
// vice versa), so this is the panel's OWN history: the prior texts of the
// ACTIVE variant, capped by count and total bytes. There is no redo — a fresh
// edit after an undo forks (v1). Switching or adding/removing a variant clears
// it (the undo context is the current variant).

/** The panel-local undo history: prior active-variant params texts, oldest →
 * newest. Pure data (a serializable value), never React state internals. */
export interface SampleHistory {
  readonly entries: readonly string[];
}

export const EMPTY_SAMPLE_HISTORY: SampleHistory = { entries: [] };

/** Retained prior-text count. */
export const MAX_SAMPLE_HISTORY = 20;
/** Byte budget across the retained texts (a hostile multi-MiB params document
 * must not let the ring pin unbounded memory). */
export const MAX_SAMPLE_HISTORY_BYTES = 4 * 1_048_576;

/** Drop the OLDEST entries until the ring is within both budgets. Newest-first
 * accounting keeps the most recent undo targets. */
function trim(entries: readonly string[]): string[] {
  const kept: string[] = [];
  let bytes = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    // The newest is retained unconditionally (a just-made edit must stay
    // undoable even if it alone exceeds the budget); older ones ride both caps.
    if (
      kept.length === 0 ||
      (kept.length < MAX_SAMPLE_HISTORY && bytes + entry.length <= MAX_SAMPLE_HISTORY_BYTES)
    ) {
      kept.push(entry);
      bytes += entry.length;
    } else {
      break;
    }
  }
  kept.reverse();
  return kept;
}

/** Record `text` (the pre-edit active-variant params) as an undo target. */
export function pushSampleHistory(history: SampleHistory, text: string): SampleHistory {
  return { entries: trim([...history.entries, text]) };
}

/** Pop the newest undo target (the text to restore), or `null` when empty. */
export function popSampleHistory(
  history: SampleHistory,
): { readonly text: string; readonly history: SampleHistory } | null {
  const { entries } = history;
  if (entries.length === 0) {
    return null;
  }
  return {
    text: entries[entries.length - 1],
    history: { entries: entries.slice(0, -1) },
  };
}

/** Whether an undo target exists. */
export function canUndoSample(history: SampleHistory): boolean {
  return history.entries.length > 0;
}
