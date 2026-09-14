// Canvas multi-selection and the align/distribute subject it feeds. The
// multi-set holds movable paths beyond the shared primary selection and is
// canvas-local — NEVER in the template, like zoom and the grid step; a fresh
// single selection or a deselect resets it. A refused drag's reason rides along
// (the placement chip shows it until the next selection interaction clears it).
//
// The set exists ONLY beside the primary it was built next to — `useMultiSet`
// owns that rule, including a primary that goes away or changes by a route that
// never passes through here. With no primary the property panel shows the
// document and the layer tree marks it current (`readSubject`), so a Shift-click
// or Shift-sweep with no primary has nothing to add to and is a plain selection.

import { useCallback, useState } from 'react';
import {
  type AlignKind,
  alignOps,
  type DistributeKind,
  distributeOps,
  movableCount,
} from '../canvas/align';
import { type FixedReason, manipulationFor } from '../canvas/manipulate';
import type { EditorController } from '../editor/useEditor';
import type { BoxIndex } from '../engine/types';
import { useMultiSet } from './useMultiSet';

/** The page index whose boxes contain `path` (align resolves against one
 * page's local geometry), or null when absent. */
function pageOf(boxes: BoxIndex, path: string | null): number | null {
  if (path === null) {
    return null;
  }
  const index = boxes.pages.findIndex((page) => page.some((box) => box.path === path));
  return index === -1 ? null : index;
}

export interface MultiSelectOptions {
  readonly editor: EditorController;
  readonly inspectBoxes: BoxIndex;
}

export interface MultiSelect {
  readonly multiSel: ReadonlySet<string>;
  readonly selectClearing: (path: string) => void;
  readonly deselectClearing: () => void;
  readonly toggleMulti: (path: string) => void;
  readonly marqueeSelect: (paths: readonly string[], additive: boolean) => void;
  readonly refused: FixedReason | null;
  readonly setRefused: (reason: FixedReason | null) => void;
  /** How many movable items the align toolbar acts on (it shows at 2). */
  readonly alignCount: number;
  readonly doAlign: (kind: AlignKind) => void;
  readonly doDistribute: (kind: DistributeKind) => void;
}

export function useMultiSelect({ editor, inspectBoxes }: MultiSelectOptions): MultiSelect {
  // Destructured ONCE: the controller object is rebuilt every render, so a memo
  // depending on it would churn — these fields are the stable ones.
  const { selection, select, clearSelection, read, applyAll, subscribe } = editor;
  // A refused drag's reason (a drag attempt on a fixed box). Shown in the
  // placement chip until the next selection interaction clears it.
  const [refused, setRefused] = useState<FixedReason | null>(null);
  const set = useMultiSet({ read, selection, subscribe });
  const { clear, toggle, addAll, replace } = set;
  const multiSel = set.paths;
  const hasPrimary = set.primary !== null;

  const selectClearing = useCallback(
    (path: string) => {
      setRefused(null);
      clear();
      select(path);
    },
    [select, clear],
  );
  const deselectClearing = useCallback(() => {
    setRefused(null);
    clear();
    clearSelection();
  }, [clearSelection, clear]);

  // Shift-click a movable box → toggle it in the multi-selection (non-movable
  // shift-clicks are ignored — align/distribute act on the movable subset).
  // With no primary there is nothing to add it BESIDE, so it becomes the primary.
  const toggleMulti = useCallback(
    (path: string) => {
      if (!hasPrimary) {
        selectClearing(path);
        return;
      }
      if (manipulationFor(read, path).kind !== 'move') {
        return;
      }
      toggle(path);
    },
    [read, hasPrimary, selectClearing, toggle],
  );

  // A rubber-band drop: additive (Shift) adds the swept movable items to the
  // set; a plain marquee replaces the whole selection (first item becomes the
  // primary, the rest the multi-set; an empty sweep deselects). An additive
  // sweep with no primary has nothing to add to, so it sweeps like a plain one.
  const marqueeSelect = useCallback(
    (paths: readonly string[], additive: boolean) => {
      setRefused(null);
      if (additive && hasPrimary) {
        addAll(paths);
        return;
      }
      if (paths.length === 0) {
        clear();
        clearSelection();
        return;
      }
      replace(paths.slice(1), paths[0]);
      select(paths[0]);
    },
    [select, clearSelection, hasPrimary, addAll, clear, replace],
  );

  // The align/distribute subject: the movable primary plus the multi-set,
  // resolved on the page that holds the primary (else the first member's page,
  // else page 0). Cheap capped reads, recomputed per render like the chip.
  const alignPaths: string[] = [...multiSel];
  if (
    selection !== null &&
    !multiSel.has(selection) &&
    manipulationFor(read, selection).kind === 'move'
  ) {
    alignPaths.push(selection);
  }
  const activePage =
    pageOf(inspectBoxes, selection) ??
    (alignPaths.length > 0 ? pageOf(inspectBoxes, alignPaths[0]) : null) ??
    0;
  const alignBoxes = inspectBoxes.pages[activePage] ?? [];
  const alignCount = movableCount(read, alignBoxes, alignPaths);
  const doAlign = (kind: AlignKind) => {
    const ops = alignOps(read, alignBoxes, alignPaths, kind);
    if (ops.length > 0) {
      applyAll(ops);
    }
  };
  const doDistribute = (kind: DistributeKind) => {
    const ops = distributeOps(read, alignBoxes, alignPaths, kind);
    if (ops.length > 0) {
      applyAll(ops);
    }
  };

  return {
    multiSel,
    selectClearing,
    deselectClearing,
    toggleMulti,
    marqueeSelect,
    refused,
    setRefused,
    alignCount,
    doAlign,
    doDistribute,
  };
}
