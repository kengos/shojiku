// Every modal, overlay, and popup the Designer mounts, assembled from four
// grouped surfaces (insert scaffolds, tutorial, blocks/context menu, review)
// plus the help dialogs, the PDF preview, and the table column sheet. All of
// them are open-flag driven — the state lives in the wiring hooks, never here.

import type { EditorController } from '../editor/useEditor';
import { GlossaryDialog } from '../help/GlossaryDialog';
import { ShortcutsDialog } from '../help/ShortcutsDialog';
import type { Blocks } from '../hooks/useBlocks';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { Copilot } from '../hooks/useCopilot';
import type { DefinitionsOwnership } from '../hooks/useDefinitionsOwnership';
import type { DocDerived } from '../hooks/useDocDerived';
import type { InsertActions } from '../hooks/useInsertActions';
import type { PdfAction } from '../hooks/usePdfAction';
import type { SampleData } from '../hooks/useSampleData';
import type { SaveFlow } from '../hooks/useSaveFlow';
import type { SelectionOps } from '../hooks/useSelectionOps';
import type { TutorialWiring } from '../hooks/useTutorialWiring';
import type { HostConfig } from '../hostConfig';
import { useI18n } from '../i18n/context';
import { readItemView } from '../panel/itemView';
import { TableColumnSheet } from '../panel/TableColumnSheet';
import { PdfPreviewModal } from '../pdf/PdfPreviewModal';
import { Offcanvas } from '../ui/Offcanvas';
import { BlockSurfaces } from './BlockSurfaces';
import { InsertDialogs } from './InsertDialogs';
import { ReviewSurfaces } from './ReviewSurfaces';
import { TutorialSurfaces } from './TutorialSurfaces';

export interface DialogHostProps {
  readonly editor: EditorController;
  readonly inserts: InsertActions;
  readonly defs: DefinitionsOwnership;
  readonly sample: SampleData;
  readonly blocks: Blocks;
  readonly selectionOps: SelectionOps;
  readonly tutorial: TutorialWiring;
  readonly save: SaveFlow;
  readonly copilot: Copilot;
  readonly pdf: PdfAction;
  /** The document derivations — the column sheet reads the format catalog
   * from here so its pickers show what each spelling renders. */
  readonly derived: DocDerived;
  /** The resolved host configuration (defaults already applied). */
  readonly host: HostConfig;
  readonly onDownloadPdf: ((pdf: Uint8Array) => void) | undefined;
  /** The Designer-local dialog flags — every surface here is open-flag driven. */
  readonly dialogs: ChromeDialogs;
}

export function DialogHost({
  editor,
  inserts,
  defs,
  sample,
  blocks,
  selectionOps,
  tutorial,
  save,
  copilot,
  pdf,
  derived,
  host,
  onDownloadPdf,
  dialogs,
}: DialogHostProps) {
  const { t } = useI18n();
  const { text, selection, applyAll, read } = editor;
  const { pdfBytes } = pdf;
  const { capabilities } = host;
  const { columnSheetOpen, glossaryOpen, shortcutsOpen } = dialogs;

  // The column sheet edits the SELECTED table. Derived from the selection
  // (a table view → its path + row source); the sheet mounts only for a table,
  // so a stale open flag can never surface it over a non-table selection.
  const selectedTableView = selection === null ? null : readItemView(read(selection));
  const columnSheetTable =
    selectedTableView !== null && selectedTableView.type === 'table'
      ? { path: selection as string, dataKey: selectedTableView.dataKey }
      : null;

  return (
    <>
      <InsertDialogs
        inserts={inserts}
        defs={defs}
        sample={sample}
        read={read}
        selection={selection}
      />
      <TutorialSurfaces tutorial={tutorial} />
      <BlockSurfaces
        blocks={blocks}
        selectionOps={selectionOps}
        editor={editor}
        capabilities={capabilities}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={dialogs.closeShortcuts} />
      {pdfBytes !== null && onDownloadPdf !== undefined ? (
        <PdfPreviewModal
          open={pdf.pdfOpen}
          onClose={pdf.closePdf}
          pdf={pdfBytes}
          onDownload={() => onDownloadPdf(pdfBytes)}
        />
      ) : null}
      <GlossaryDialog open={glossaryOpen} onClose={dialogs.closeGlossary} />
      <ReviewSurfaces save={save} copilot={copilot} text={text} applyAll={applyAll} />
      {columnSheetTable !== null ? (
        <Offcanvas
          open={columnSheetOpen}
          onClose={dialogs.closeColumnSheet}
          title={t('sheet.columns.title')}
          closeLabel={t('sheet.close')}
        >
          <TableColumnSheet
            controller={editor}
            tablePath={columnSheetTable.path}
            dataKey={columnSheetTable.dataKey}
            groups={defs.paletteGroups}
            params={sample.params}
            capabilities={capabilities}
            formatCatalog={derived.formats.catalog}
          />
        </Offcanvas>
      ) : null}
    </>
  );
}
