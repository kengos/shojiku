// The paste-import dialog: spreadsheet clipboard text becomes a NEW
// table plus VERBATIM sample rows. The source key is derived fresh against the
// current params (so extendParamsValue never refuses on a collision); the rows
// are committed only after the insert succeeds — a refused op leaves no orphan
// params. Always inserts a table; never rewrites existing columns.

import { useState } from 'react';
import { resolveIterableTarget } from '../insert/iterableTarget';
import { buildPasteScaffold, type PasteRefusal } from '../insert/paste';
import type { PasteGrid } from '../insert/pasteGrid';
import { scaffoldSnippet } from '../insert/scaffoldSnippet';
import { extendParamsValue } from '../sample/generate';
import { parseParams } from '../sample/model';
import { updateActive } from '../sample/variants';
import type { InsertContext } from './insertContext';

export interface PasteInsert {
  readonly pasteOpen: boolean;
  readonly setPasteOpen: (open: boolean) => void;
  readonly handlePasteConfirm: (grid: PasteGrid) => PasteRefusal | null;
}

export function usePasteInsert(ctx: InsertContext): PasteInsert {
  const { read, selection, apply, select, params, sampleSet, commitSet, canDeclare } = ctx;
  const [pasteOpen, setPasteOpen] = useState(false);

  const handlePasteConfirm = (grid: PasteGrid): PasteRefusal | null => {
    // Existing keys drive a fresh, collision-free source key; unreadable params
    // read as no keys here and `extendParamsValue` (the ONE authority) reports
    // the invalid_params refusal below.
    const { spec, rows } = buildPasteScaffold(grid, Object.keys(parseParams(params) ?? {}));
    const ext = extendParamsValue(params, spec.sourceKey, rows);
    if (!ext.ok) {
      return ext.reason;
    }
    const target = resolveIterableTarget(read, selection);
    const result = apply({
      op: 'insertItem',
      path: target.path,
      index: target.index,
      value: scaffoldSnippet(spec, 'table', canDeclare),
    });
    if (!result.ok) {
      return 'insert_failed';
    }
    commitSet(updateActive(sampleSet, ext.text));
    select(`${target.path}[${target.index}]`);
    setPasteOpen(false);
    return null;
  };

  return { pasteOpen, setPasteOpen, handlePasteConfirm };
}
