// The container picker (the insert menu's container picker): a picked n×m cell becomes
// ONE scaffold. When a PLACEHOLDER slot is selected, it REPLACES that slot in
// place (nest-into-slot — the stack → pick-a-slot → insert-a-row path); otherwise
// it inserts at the ordinary target. Selected on success.

import { useCallback, useState } from 'react';
import { resolveContainerInsert } from '../insert/containerInsert';
import { containerShape, containerSnippet } from '../insert/containerModel';
import type { InsertContext } from './insertContext';

export interface ContainerInsert {
  readonly containerPickerOpen: boolean;
  readonly setContainerPickerOpen: (open: boolean) => void;
  readonly handleContainerPick: (columns: number, rows: number) => void;
}

export function useContainerInsert(ctx: InsertContext): ContainerInsert {
  const { read, selection, apply, applyAll, select, t } = ctx;
  const [containerPickerOpen, setContainerPickerOpen] = useState(false);

  const handleContainerPick = useCallback(
    (columns: number, rows: number) => {
      setContainerPickerOpen(false);
      const shape = containerShape(columns, rows);
      /* v8 ignore next 3 -- the dialog only passes its own in-bounds loop constants; kept as a fail-closed guard against a hostile synthetic call */
      if (shape === null) {
        return;
      }
      const snippet = containerSnippet(shape, t('insert.defaultText'));
      const dest = resolveContainerInsert(read, selection, t('insert.defaultText'));
      if (dest.mode === 'nest') {
        // Replace the placeholder slot: insert the container before it, then
        // remove the slot (now shifted by one) — ONE undo step. The container
        // ends up at the slot's index.
        const result = applyAll([
          { op: 'insertItem', path: dest.path, index: dest.index, value: snippet },
          { op: 'removeItem', path: dest.path, index: dest.index + 1 },
        ]);
        /* v8 ignore next 3 -- the resolver validated the slot against the SAME document in this tick (and the picker snippet is bounds-capped), so the batch cannot fail; kept as a race guard */
        if (!result.ok) {
          return;
        }
        select(`${dest.path}[${dest.index}]`);
        return;
      }
      const result = apply({
        op: 'insertItem',
        path: dest.target.path,
        index: dest.target.index,
        value: snippet,
      });
      if (result.ok) {
        select(`${dest.target.path}[${dest.target.index}]`);
      }
    },
    [read, selection, apply, applyAll, select, t],
  );

  return { containerPickerOpen, setContainerPickerOpen, handleContainerPick };
}
