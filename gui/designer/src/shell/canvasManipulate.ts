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
  readonly applyAll: EditorController['applyAll'];
  readonly selectClearing: MultiSelect['selectClearing'];
  readonly setRefused: MultiSelect['setRefused'];
  readonly grid: number;
}

/** Build the overlay's manipulation wiring. A drop that CHANGES the item's
 * path — a same-parent reorder or a cross-parent move — is ONE transactional
 * `applyAll` batch and the selection travels with the item; a
 * move/resize/nudge is the same one batch with the path unchanged; a refused
 * drag surfaces its reason in the placement chip. An op-layer rejection
 * changes nothing. */
export function canvasManipulate({
  read,
  applyAll,
  selectClearing,
  setRefused,
  grid,
}: CanvasManipulateOptions): CanvasManipulate {
  return {
    read,
    onReorder: (ops, selectPath) => {
      // ONE transactional batch: a same-parent reorder is a single `moveItem`,
      // a cross-parent one is the `box` keys the crossing invalidates plus the
      // `moveItem` — either way one undo step, and the selection follows the
      // item to wherever it landed.
      // `selectClearing`, not `select`: every path in the multi-selection is
      // an INDEX, and a move renumbers the siblings it passes — so after any
      // commit here the other members name different items than the user
      // picked, and the align toolbar would act on the wrong pair.
      if (applyAll(ops).ok) {
        selectClearing(selectPath);
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
