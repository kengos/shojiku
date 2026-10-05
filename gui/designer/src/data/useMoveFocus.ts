// After a row list's up / down button moves a row, the focus follows the row to
// its new place — on the same button, or the other one when that one is now
// disabled (the row reached an end). Shared by the choices and the declared
// display formats; the list element carries the rows as its children.

import { type RefObject, useEffect, useRef, useState } from 'react';

export interface MoveFocus {
  readonly listRef: RefObject<HTMLUListElement | null>;
  /** Record a move by `step` from row `index` (focus lands after the render). */
  readonly moved: (index: number, step: -1 | 1) => void;
}

export function useMoveFocus(): MoveFocus {
  const listRef = useRef<HTMLUListElement>(null);
  const [focus, setFocus] = useState<{ index: number; button: 'up' | 'down' } | null>(null);
  useEffect(() => {
    if (focus === null) {
      return;
    }
    const row = listRef.current?.children.item(focus.index);
    const other = focus.button === 'up' ? 'down' : 'up';
    const pick = (button: string) =>
      row?.querySelector<HTMLButtonElement>(`[data-move="${button}"]:not(:disabled)`);
    (pick(focus.button) ?? pick(other))?.focus();
    setFocus(null);
  }, [focus]);
  return {
    listRef,
    moved: (index, step) => setFocus({ index: index + step, button: step === -1 ? 'up' : 'down' }),
  };
}
