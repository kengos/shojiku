// The menubar columns, assembled from the live wiring. Every item dispatches an
// EXISTING op or host callback threaded in through the context — no new
// document-mutation path is introduced here (AI parity).
//
// The UNTRUSTED host entries are validated here, memoized per host-input
// change, so the raw host array never reaches `buildMenubar`. That adjacency is
// deliberate: `hostMenuEntries` is the one raw host input the shell touches and
// it stays out of the shared `HostConfig` bundle for exactly this reason.

import { useMemo } from 'react';
import type { EditorController } from '../editor/useEditor';
import { bandOf } from '../hooks/geometry';
import type { Blocks } from '../hooks/useBlocks';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { DocViews } from '../hooks/useDocViews';
import type { ImageImport } from '../hooks/useImageImport';
import type { InsertActions } from '../hooks/useInsertActions';
import type { PdfAction } from '../hooks/usePdfAction';
import type { SaveFlow } from '../hooks/useSaveFlow';
import type { SelectionOps } from '../hooks/useSelectionOps';
import type { TutorialWiring } from '../hooks/useTutorialWiring';
import { useI18n } from '../i18n/context';
import { activateBand } from '../insert/bandCreate';
import { blockInsertGroup } from '../insert/blockModel';
import { isFlowTarget } from '../insert/flowPlacement';
import type { InsertGroup } from '../insert/insertMenu';
import { resolveInsertTarget } from '../insert/model';
import {
  buildMenubar,
  type MenuColumn,
  type RawHostMenuEntry,
  validateHostEntries,
} from '../menubar/model';
import type { DesignerProps } from '../props';
import { seqPosition } from '../tree/reorder';

export interface MenubarColumnsOptions {
  readonly editor: EditorController;
  readonly menuActions: DesignerProps['menuActions'];
  /** RAW host input — validated inside, never trusted by a caller. */
  readonly hostMenuEntries: readonly RawHostMenuEntry[] | undefined;
  readonly insertGroups: readonly InsertGroup[];
  readonly inserts: InsertActions;
  readonly image: ImageImport;
  readonly blocks: Blocks;
  readonly selectionOps: SelectionOps;
  readonly save: SaveFlow;
  readonly pdf: PdfAction;
  readonly views: DocViews;
  readonly tutorial: TutorialWiring;
  readonly dialogs: ChromeDialogs;
}

export function useMenubarColumns(options: MenubarColumnsOptions): MenuColumn[] {
  const { t } = useI18n();
  const { editor, menuActions, hostMenuEntries, blocks, inserts, image } = options;
  const { save, pdf, views, tutorial, dialogs, selectionOps, insertGroups } = options;
  const { uiEvent } = tutorial;

  // The export review opener — present ONLY when the host injected an export
  // action (the File menu gates on it), so the captured `onExport` is a plain
  // function here (no optional call at confirm time). `undefined` = no export.
  const onExport = menuActions?.onExport;
  const openExportReview =
    onExport === undefined
      ? undefined
      : () =>
          save.setReview({
            mode: 'export',
            run: () => {
              onExport();
              uiEvent('export:done');
            },
          });

  // Host entries are validated from the raw host input, memoized per host-input
  // change — the untrusted-input validation it is.
  const hostEntries = useMemo(() => validateHostEntries(hostMenuEntries), [hostMenuEntries]);
  // The selection-gated duplicate/delete are offered only for a
  // sequence-addressed selection (the shortcuts' guard).
  const seqSelected = editor.selection !== null && seqPosition(editor.selection) !== null;

  // ONE resolution, read by both owner gates below — they are two questions
  // about the same target, and resolving twice invites them to disagree.
  const insertPath = resolveInsertTarget(editor.read, editor.selection).path;
  return buildMenubar(t, {
    onBack: menuActions?.onBack,
    onOpen: menuActions?.onOpen,
    // Save and export both route through the review pane first; its
    // confirm runs the real save/export. Export stays host-gated.
    onExport: openExportReview,
    onPdf: pdf.openPdf,
    onAddFont: menuActions?.onAddFont,
    onSnapshots: menuActions?.onSnapshots,
    onSave: () => save.setReview({ mode: 'save', run: save.confirmSave }),
    onDocumentSettings: () => views.openDocView('page'),
    onDataEditor: views.openDataView,
    hostEntries,
    onUndo: editor.undo,
    canUndo: editor.canUndo,
    onRedo: editor.redo,
    canRedo: editor.canRedo,
    onDuplicate: seqSelected ? selectionOps.duplicateSelected : undefined,
    onDelete: seqSelected ? selectionOps.deleteSelected : undefined,
    insert: blocks.blockArmed
      ? [...insertGroups, blockInsertGroup(blocks.blockList)]
      : insertGroups,
    onInsertKind: inserts.insert,
    onSaveBlock: () => blocks.openSaveBlock(blocks.selectionBlockValue),
    onInsertBlock: blocks.insertBlock,
    onManageBlocks: () => blocks.setManageBlocksOpen(true),
    blockSavable: blocks.blockSavable,
    onContainer: () => {
      uiEvent('dialog:container');
      inserts.setContainerPickerOpen(true);
    },
    onIterable: () => {
      uiEvent('dialog:iterable');
      inserts.setIterableOpen(true);
    },
    onField: () => {
      uiEvent('dialog:field');
      inserts.openFieldInsert();
    },
    onImage: image.onImageInsert,
    onPaste: () => inserts.setPasteOpen(true),
    onBand: (band) => activateBand(band, editor.read, editor.applyAll, editor.select),
    onShortcuts: dialogs.openShortcuts,
    onGlossary: dialogs.openGlossary,
    onTutorial: tutorial.openTutorial,
    bandTarget: bandOf(insertPath) !== null,
    flowTarget: isFlowTarget(editor.read, insertPath),
  });
}
