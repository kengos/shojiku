// The document title as a click-to-rename control (the Google-Docs affordance):
// the text button that swaps in an input, and the input's commit discipline —
// uncontrolled + seeded once, blur as the SINGLE exit, Enter/Escape driving that
// blur, and both ignored while an IME composition is active (a Japanese user
// confirming a kanji conversion with Enter must not also commit the rename).

import { MAX_NAME_CHARS } from '@shojiku/designer';
import { useCallback, useRef, useState } from 'react';

/** The rename input shown while editing the title. Uncontrolled (seeded once);
 * commits on blur, with Enter / Escape driving that blur so onBlur is the single
 * exit — Escape marks the exit a cancel. The value is read off the blur event,
 * so no persistent ref is needed. */
function TitleInput({
  initial,
  label,
  onCommit,
  onCancel,
}: {
  readonly initial: string;
  readonly label: string;
  readonly onCommit: (raw: string) => void;
  readonly onCancel: () => void;
}) {
  const cancelled = useRef(false);
  // Focus + select-all on mount via a callback ref (null-on-unmount keeps both
  // branches covered); a persistent ref would leave a dead null-guard.
  const focusRef = useCallback((el: HTMLInputElement | null) => {
    if (el !== null) {
      el.focus();
      el.select();
    }
  }, []);
  return (
    <input
      ref={focusRef}
      type="text"
      defaultValue={initial}
      maxLength={MAX_NAME_CHARS}
      aria-label={label}
      className="min-w-0 flex-1 rounded border border-border bg-surface px-1 py-0.5 font-semibold text-text"
      onKeyDown={(e) => {
        // Ignore Enter / Escape while an IME composition is active — a Japanese
        // user pressing Enter to confirm a kanji conversion must not also commit
        // (or cancel) the rename.
        if (e.nativeEvent.isComposing) {
          return;
        }
        if (e.key !== 'Enter' && e.key !== 'Escape') {
          return;
        }
        if (e.key === 'Escape') {
          cancelled.current = true;
        }
        e.currentTarget.blur();
      }}
      onBlur={(e) => {
        if (cancelled.current) {
          onCancel();
        } else {
          onCommit(e.target.value);
        }
      }}
    />
  );
}

/** The document title as a click-to-rename control. Renders the name as a text
 * button; clicking swaps in the input. Commit trims + clips and skips an empty
 * or unchanged value (the caller decides what an unchanged-to-the-default name
 * means). */
export function EditableTitle({
  name,
  label,
  onRename,
}: {
  readonly name: string;
  readonly label: string;
  readonly onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const commit = (raw: string) => {
    setEditing(false);
    const next = raw.trim().slice(0, MAX_NAME_CHARS);
    if (next !== '' && next !== name) {
      onRename(next);
    }
  };
  if (editing) {
    return (
      <TitleInput
        initial={name}
        label={label}
        onCommit={commit}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    // The visible document name IS the accessible name (WCAG label-in-name: a
    // voice-control user activates it by saying the title); the rename
    // affordance is the accessible DESCRIPTION via `title`, never an
    // aria-label that would replace the name.
    <button
      type="button"
      title={label}
      className="min-w-0 cursor-pointer truncate rounded border-0 bg-transparent p-0 text-left font-semibold text-text hover:underline"
      onClick={() => setEditing(true)}
    >
      {name}
    </button>
  );
}
