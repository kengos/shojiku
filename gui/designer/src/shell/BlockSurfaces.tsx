// The right-click context menu, the border popover it can open, and the
// reusable-block dialogs. The menu's rows are accelerators only — every one of
// them also ships on a keyboard-reachable control (the Edit menu's
// duplicate/delete, the placement tab's wrap button, the format toolbar's
// border button, the insert menu's reusable-block group).
//
// Which rows apply is `contextMenuRows`; this file only turns a row into its
// chrome label and its action.

import { useState } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { Blocks } from '../hooks/useBlocks';
import type { SelectionOps } from '../hooks/useSelectionOps';
import { useI18n } from '../i18n/context';
import { BlockDialog } from '../insert/BlockDialog';
import { BlockManageDialog } from '../insert/BlockManageDialog';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';
import { BorderPopover } from './BorderPopover';
import { type ContextRow, contextMenuRows, readNodeAt } from './contextMenuRows';

export interface BlockSurfacesProps {
  readonly blocks: Blocks;
  readonly selectionOps: SelectionOps;
  readonly editor: EditorController;
  readonly capabilities: readonly string[] | undefined;
}

/** Where the border popover sits and what it edits — the border row hands over
 * the pointer position the menu was opened at. */
interface BorderTarget {
  readonly x: number;
  readonly y: number;
  readonly path: string;
}

export function BlockSurfaces({ blocks, selectionOps, editor, capabilities }: BlockSurfacesProps) {
  const { t } = useI18n();
  const menu = selectionOps.contextMenu;
  const [borderTarget, setBorderTarget] = useState<BorderTarget | null>(null);

  // Read the target ONCE — the row rules and the save-block snippet both want
  // it, and the snippet rides the row rather than being re-read at click time.
  const node = menu === null ? undefined : readNodeAt(editor.read, menu.path);
  const toItem = (row: ContextRow, at: BorderTarget): ContextMenuItem => {
    switch (row.kind) {
      case 'duplicate':
        return { label: t('menu.duplicate'), onSelect: () => selectionOps.duplicateAt(at.path) };
      case 'delete':
        return { label: t('menu.delete'), onSelect: () => selectionOps.deleteAt(at.path) };
      case 'wrap':
        return { label: t('contextMenu.wrap'), onSelect: () => selectionOps.wrapSelected(at.path) };
      case 'border':
        return { label: t('contextMenu.border'), onSelect: () => setBorderTarget(at) };
      case 'saveBlock':
        return {
          label: t('contextMenu.saveBlock'),
          onSelect: () => blocks.openSaveBlock(row.block),
        };
    }
  };
  const menuItems =
    menu === null
      ? []
      : contextMenuRows({
          node,
          path: menu.path,
          blockArmed: blocks.blockArmed,
          capabilities,
        }).map((row) => toItem(row, menu));

  return (
    <>
      <ContextMenu at={menu} items={menuItems} onClose={selectionOps.closeContextMenu} />
      {borderTarget !== null ? (
        <BorderPopover
          at={borderTarget}
          path={borderTarget.path}
          controller={editor}
          capabilities={capabilities}
          onClose={() => setBorderTarget(null)}
        />
      ) : null}
      {blocks.saveBlock !== null ? (
        <BlockDialog onConfirm={blocks.confirmSaveBlock} onClose={blocks.closeSaveBlock} />
      ) : null}
      {blocks.manageBlocksOpen ? (
        <BlockManageDialog
          blocks={blocks.blockList}
          onDelete={blocks.deleteBlock}
          onClose={() => blocks.setManageBlocksOpen(false)}
        />
      ) : null}
    </>
  );
}
