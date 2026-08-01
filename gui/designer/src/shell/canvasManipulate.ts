// The canvas's direct-manipulation plan, as a pure factory over the editor
// callbacks. Classification and plan math come from the DOCUMENT (the pure
// `canvas/manipulate` model over `read`); geometry comes from the inspect
// boxes. `CanvasArea` memoizes the result — this file holds only what the
// overlay is handed.

import type { CanvasManipulate } from '../canvas/overlayDragModel';
import type { EditorController } from '../editor/useEditor';
import type { MultiSelect } from '../hooks/useMultiSelect';

export interface CanvasManipulateOptions {
  readonly read: EditorController['read'];
  readonly apply: EditorController['apply'];
  readonly applyAll: EditorController['applyAll'];
  readonly select: EditorController['select'];
  readonly selectClearing: MultiSelect['selectClearing'];
  readonly setRefused: MultiSelect['setRefused'];
  readonly grid: number;
}

/** Build the overlay's manipulation wiring. A reorder drop is ONE `moveItem`
 * (selection travels with the item); a move/resize/nudge is ONE transactional
 * `applyAll` batch = one undo step (the path — and so the selection — never
 * changes); a refused drag surfaces its reason in the placement chip. An
 * op-layer rejection changes nothing. */
export function canvasManipulate({
  read,
  apply,
  applyAll,
  select,
  selectClearing,
  setRefused,
  grid,
}: CanvasManipulateOptions): CanvasManipulate {
  return {
    read,
    onReorder: (op) => {
      if (apply(op).ok) {
        select(`${op.path}[${op.to}]`);
      }
    },
    onApply: (path, ops) => {
      // A committed move/resize/nudge selects its item (the drag's trailing
      // click is consumed, so selection must travel here); the path never
      // changes across these ops.
      /* v8 ignore next 3 -- the drop re-plans against the same document read it applies to in the same tick, so the batch cannot be refused; kept as a race guard. */
      if (!applyAll(ops).ok) {
        return;
      }
      selectClearing(path);
    },
    onRefused: setRefused,
    grid,
  };
}
