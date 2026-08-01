// The right-click context menu and the reusable-block dialogs it can open.
// The menu's rows are accelerators only — both actions also ship on a
// keyboard-reachable control (the placement tab's wrap button, the insert menu's
// reusable-block group).

import type { Blocks } from '../hooks/useBlocks';
import type { SelectionOps } from '../hooks/useSelectionOps';
import { useI18n } from '../i18n/context';
import { BlockDialog } from '../insert/BlockDialog';
import { BlockManageDialog } from '../insert/BlockManageDialog';
import { blockFromNode } from '../insert/blockModel';
import { isWrappablePath } from '../insert/wrap';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

export interface BlockSurfacesProps {
  readonly blocks: Blocks;
  readonly selectionOps: SelectionOps;
  readonly read: (path: string) => unknown;
}

export function BlockSurfaces({ blocks, selectionOps, read }: BlockSurfacesProps) {
  const { t } = useI18n();
  const { contextMenu } = selectionOps;

  const menuItems = ((): ContextMenuItem[] => {
    if (contextMenu === null) {
      return [];
    }
    const items: ContextMenuItem[] = [];
    if (isWrappablePath(contextMenu.path)) {
      items.push({
        label: t('contextMenu.wrap'),
        onSelect: () => selectionOps.wrapSelected(contextMenu.path),
      });
    }
    // Capture the savable snippet here (non-null = the row appears); the
    // onSelect closes over the value, so no second read at click time.
    const blockValue = blocks.blockArmed ? blockFromNode(read(contextMenu.path)) : null;
    if (blockValue !== null) {
      items.push({
        label: t('contextMenu.saveBlock'),
        onSelect: () => blocks.openSaveBlock(blockValue),
      });
    }
    return items;
  })();

  return (
    <>
      <ContextMenu at={contextMenu} items={menuItems} onClose={selectionOps.closeContextMenu} />
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
