// The undo/redo stack PAIR the editing session moves along: a fresh edit forks
// (clears redo) and pushes its pre-edit entry under the budget; a step back or
// forward parks the current state on the opposite stack carrying the crossed
// step's effect, so that effect is reported again whichever way the step is
// crossed next. What an entry IS lives in `history.ts`; the session that builds
// the entries and restores them lives in `editor.ts`.

import { type HistoryEntry, MAX_HISTORY, MAX_HISTORY_BYTES, trimHistory } from './history';

/** Builds the CURRENT state as an entry carrying the crossed step's effect. */
type Current<C, E> = (effect: E | undefined) => HistoryEntry<C, E>;

export class UndoStack<C, E> {
  #undo: HistoryEntry<C, E>[] = [];
  #redo: HistoryEntry<C, E>[] = [];

  /** A fresh edit: fork history, push the pre-edit `entry`, trim to budget. */
  record(entry: HistoryEntry<C, E>): void {
    this.#redo = [];
    this.#undo.push(entry);
    this.#undo = trimHistory(this.#undo, MAX_HISTORY, MAX_HISTORY_BYTES);
  }

  canUndo(): boolean {
    return this.#undo.length > 0;
  }

  canRedo(): boolean {
    return this.#redo.length > 0;
  }

  /** The effect of the step a `back` would cross. */
  undoEffect(): E | undefined {
    return this.#undo[this.#undo.length - 1]?.effect;
  }

  /** Pop the entry to go back to, parking the current state on redo. */
  back(current: Current<C, E>): HistoryEntry<C, E> | undefined {
    const previous = this.#undo.pop();
    if (previous !== undefined) {
      this.#redo.push(current(previous.effect));
    }
    return previous;
  }

  /** Pop the entry to go forward to, parking the current state on undo. */
  forward(current: Current<C, E>): HistoryEntry<C, E> | undefined {
    const next = this.#redo.pop();
    if (next !== undefined) {
      this.#undo.push(current(next.effect));
    }
    return next;
  }
}
