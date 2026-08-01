// The pure key→intent table for the Designer's window-level shortcuts, kept
// free of React and the document so the mapping is exhaustively unit-testable.
// Selection-aware decisions (is anything selected? is it a sequence item?) stay
// in the caller — this only names which action a key chord means. The caller is
// still responsible for the editable-target guard (a shortcut must never fire
// from inside an input/textarea/contenteditable).

export type ShortcutAction = 'undo' | 'redo' | 'delete' | 'duplicate' | 'deselect';

export interface KeyChord {
  readonly key: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
}

/** The action a key chord triggers, or `null` for an unhandled key. */
export function shortcutAction(chord: KeyChord): ShortcutAction | null {
  if (chord.key === 'Escape') {
    return 'deselect';
  }
  const mod = chord.meta || chord.ctrl;
  const lower = chord.key.toLowerCase();
  if (mod && lower === 'z') {
    return chord.shift ? 'redo' : 'undo';
  }
  if (mod && lower === 'd') {
    return 'duplicate';
  }
  if (chord.key === 'Delete' || chord.key === 'Backspace') {
    return 'delete';
  }
  return null;
}
