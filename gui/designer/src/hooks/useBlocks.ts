// Reusable blocks: the library is host-owned (cross-document, app-global) — the
// Designer runs the pure model against the `blocks` prop and reports the updated
// library up through `onBlocksChange`, which persists it and re-renders with the
// new list. The feature is armed only when the host wired persistence. Inserting
// a block is a plain `insertItem` (AI parity).

import type { SnippetValue } from '@shojiku/designer-core';
import { useCallback, useState } from 'react';
import { typeFitsOwner } from '../canvas/dnd';
import type { EditorController } from '../editor/useEditor';
import { bandBoxHeightPt } from '../insert/bandGeometry';
import { bandInsertY, bandPlaced } from '../insert/bandPlacement';
import {
  addBlock,
  type BlockRefusal,
  blockFromNode,
  removeBlock,
  type SavedBlock,
} from '../insert/blockModel';
import { resolveInsertTarget } from '../insert/model';
import type { LastGoodPreview } from '../preview/reducer';
import { bandOf } from './geometry';

/** The stable empty block library (a host with the feature off / no saved blocks). */
const EMPTY_BLOCKS: readonly SavedBlock[] = [];

export interface BlocksOptions {
  readonly blocks: readonly SavedBlock[] | undefined;
  readonly onBlocksChange: ((blocks: readonly SavedBlock[]) => void) | undefined;
  readonly editor: EditorController;
  readonly multiSel: ReadonlySet<string>;
  readonly previewRef: { readonly current: LastGoodPreview | null };
}

export interface Blocks {
  readonly blockArmed: boolean;
  readonly blockList: readonly SavedBlock[];
  /** The snippet the CURRENT single selection would save as, or null when there
   * is no savable single selection. */
  readonly selectionBlockValue: SnippetValue | null;
  readonly blockSavable: boolean;
  readonly saveBlock: { readonly value: SnippetValue } | null;
  readonly openSaveBlock: (value: SnippetValue | null) => void;
  readonly closeSaveBlock: () => void;
  readonly confirmSaveBlock: (name: string) => BlockRefusal | null;
  readonly insertBlock: (id: string) => void;
  readonly manageBlocksOpen: boolean;
  readonly setManageBlocksOpen: (open: boolean) => void;
  readonly deleteBlock: (id: string) => void;
}

export function useBlocks({
  blocks,
  onBlocksChange,
  editor,
  multiSel,
  previewRef,
}: BlocksOptions): Blocks {
  // Destructured ONCE: the controller object is rebuilt every render, so the
  // memo deps below must be these stable fields, never `editor` itself.
  const { selection, read, apply, select } = editor;
  const blockArmed = onBlocksChange !== undefined;
  const blockList = blocks ?? EMPTY_BLOCKS;
  // The snippet the CURRENT single selection would save as, or null when there is
  // no savable single selection (nothing selected, a multi-selection — wrap it
  // first — or a node that cannot become a snippet). `blockSavable` is derived
  // from it so the two never disagree.
  const selectionBlockValue =
    blockArmed && selection !== null && multiSel.size === 0 ? blockFromNode(read(selection)) : null;
  const blockSavable = selectionBlockValue !== null;

  // The save-as-block dialog holds the snippet it will save (captured at open, so
  // a later selection change cannot swap it out from under the naming dialog).
  const [saveBlock, setSaveBlockState] = useState<{ readonly value: SnippetValue } | null>(null);
  const openSaveBlock = useCallback((value: SnippetValue | null) => {
    /* v8 ignore next 3 -- callers pass a non-null value (context-menu capture / the save row is disabled without a savable selection, and Headless UI never fires a disabled item); the guard is a same-tick safety net */
    if (value === null) {
      return;
    }
    setSaveBlockState({ value });
  }, []);
  const closeSaveBlock = useCallback(() => setSaveBlockState(null), []);
  const confirmSaveBlock = useCallback(
    (name: string): BlockRefusal | null => {
      /* v8 ignore next 3 -- the dialog only mounts while `saveBlock` is set, so confirm always has a value */
      if (saveBlock === null) {
        return null;
      }
      const outcome = addBlock(blockList, name, saveBlock.value);
      if (!outcome.ok) {
        return outcome.refusal;
      }
      onBlocksChange?.(outcome.blocks);
      setSaveBlockState(null);
      return null;
    },
    [saveBlock, blockList, onBlocksChange],
  );

  // Insert a saved block at the resolved target (band-placed like an element
  // insert when the target is a header/footer band), selected on success.
  const insertBlock = useCallback(
    (id: string) => {
      const block = blockList.find((b) => b.id === id);
      /* v8 ignore next 3 -- the menu only lists existing blocks, so a lookup miss (a block deleted in another tab between build and click) is not reproducible in one render; a harmless no-op */
      if (block === undefined) {
        return;
      }
      const target = resolveInsertTarget(read, selection);
      const band = bandOf(target.path);
      // The menu already disables this row, and this is the second lock on the
      // same door: a flow-only kind inside a band is a PARSE error, so the
      // whole document stops rendering rather than one item misplacing. The
      // two can only disagree when the selection MOVES between the menu being
      // built and the row being clicked — the same build-vs-click race the
      // lookup guard above covers, and not stageable in a single render.
      /* v8 ignore next 3 -- unreachable while the row is disabled; guards the build-vs-click selection race, like the lookup miss above */
      if (band !== null && !typeFitsOwner((block.value as Record<string, unknown>).type, 'band')) {
        return;
      }
      const result = apply({
        op: 'insertItem',
        path: target.path,
        index: target.index,
        value:
          band === null
            ? block.value
            : bandPlaced(block.value, bandInsertY(band, bandBoxHeightPt(previewRef.current, read))),
      });
      if (result.ok) {
        select(`${target.path}[${target.index}]`);
      }
    },
    [blockList, read, selection, apply, select, previewRef],
  );

  const [manageBlocksOpen, setManageBlocksOpen] = useState(false);
  const deleteBlock = useCallback(
    (id: string) => onBlocksChange?.(removeBlock(blockList, id)),
    [blockList, onBlocksChange],
  );

  return {
    blockArmed,
    blockList,
    selectionBlockValue,
    blockSavable,
    saveBlock,
    openSaveBlock,
    closeSaveBlock,
    confirmSaveBlock,
    insertBlock,
    manageBlocksOpen,
    setManageBlocksOpen,
    deleteBlock,
  };
}
