// The choices TABLE: the member rows in the order the wire keeps them (the
// engine reads no order into it, but a person reads the list top down, and the
// sample select offers it in this order), one `EnumRow` each.
//
// Every row edit is ONE op over the whole list (`enumModel.ts`). Reordering is a
// grip drag (`useEnumDrag`) or a row's up / down button — both only at two or
// more rows, like the rule list's; after a button move the focus follows the
// member to its new row.

import type { Op } from '@shojiku/designer-core';
import { useEffect, useRef, useState } from 'react';
import { EnumRow } from './EnumRow';
import { type EnumTarget, moveRow } from './enumEdits';
import type { EnumEdit } from './enumModel';
import { useEnumDrag } from './useEnumDrag';
import { shownScalar } from './valueRules';

export interface EnumRowsProps {
  readonly target: EnumTarget;
  readonly editable: boolean;
  /** Dispatch an edit's op; the refusal MESSAGE when it was refused. */
  readonly apply: (edit: EnumEdit) => string | null;
  readonly dispatch: (op: Op | null) => void;
}

export function EnumRows({ target, editable, apply, dispatch }: EnumRowsProps) {
  const movable = editable && target.rows.length > 1;
  const drag = useEnumDrag(target, dispatch);
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

  const move = (index: number, step: -1 | 1) => {
    // Slot math: the slot BEFORE the row above, or AFTER the row below.
    dispatch(moveRow(target, index, step === -1 ? index - 1 : index + 2));
    setFocus({ index: index + step, button: step === -1 ? 'up' : 'down' });
  };

  return (
    <ul ref={listRef} className="m-0 flex list-none flex-col gap-1 p-0">
      {target.rows.map((row, index) => (
        <EnumRow
          // The list is a sequence with no ids and may repeat a value (the
          // engine allows it), so the position is part of a row's identity; the
          // value is the rest, so a moved member's row remounts with its text.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={`${index}:${typeof row.value}:${shownScalar(row.value)}`}
          target={target}
          index={index}
          editable={editable}
          movable={movable}
          drag={drag}
          apply={apply}
          onMove={(step) => move(index, step)}
        />
      ))}
    </ul>
  );
}
