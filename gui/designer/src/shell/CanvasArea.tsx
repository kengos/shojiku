// The center column: the canvas topbar over the scrolling page stack. It owns
// the direct-manipulation wiring the overlay is handed — classification and
// plan math come from the DOCUMENT (the pure `canvas/manipulate` model over
// `read`), geometry from the inspect boxes.

import { useMemo } from 'react';
import { DesignerCanvas } from '../canvas/DesignerCanvas';
import type { CanvasManipulate } from '../canvas/overlayDragModel';
import { PageRail } from '../canvas/PageRail';
import type { EditorController } from '../editor/useEditor';
import type { ContainerMarks } from '../hooks/useContainerMarks';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { ImageImport } from '../hooks/useImageImport';
import type { InlineEdit } from '../hooks/useInlineEdit';
import type { InsertActions } from '../hooks/useInsertActions';
import { useLinkHints } from '../hooks/useLinkHints';
import type { MultiSelect } from '../hooks/useMultiSelect';
import type { PageNav } from '../hooks/usePageNav';
import type { PaletteDragWiring } from '../hooks/usePaletteDrag';
import type { PdfAction } from '../hooks/usePdfAction';
import type { PreviewSession } from '../hooks/usePreviewSession';
import { useI18n } from '../i18n/context';
import type { TreeView } from '../tree/model';
import { CanvasEmptyState } from './CanvasEmptyState';
import { CanvasTopbar } from './CanvasTopbar';
import { canvasManipulate } from './canvasManipulate';

export interface CanvasAreaProps {
  readonly editor: EditorController;
  readonly prefs: EditorPrefs;
  readonly multi: MultiSelect;
  readonly nav: PageNav;
  readonly drag: PaletteDragWiring;
  readonly image: ImageImport;
  readonly inline: InlineEdit;
  readonly marks: ContainerMarks;
  readonly pdf: PdfAction;
  readonly inserts: InsertActions;
  readonly treeView: TreeView | null;
  /** The preview half of the editing session — pages, boxes, the render
   * scales, the transport status and the canvas scroll ref. */
  readonly session: PreviewSession;
  readonly onContextMenu: (path: string, x: number, y: number) => void;
  /** Why the last copy (⌘D / block insert) did not happen — a catalog key. */
  readonly copyNotice: string | null;
}

export function CanvasArea({
  editor,
  prefs,
  multi,
  nav,
  drag,
  image,
  inline,
  marks,
  pdf,
  inserts,
  treeView,
  session,
  onContextMenu,
  copyNotice,
}: CanvasAreaProps) {
  const { t } = useI18n();
  // Locals, not property reads: memo dependencies must be the stable callback
  // fields (never the per-render bundle), and control-flow narrowing follows a
  // local binding.
  const { read, applyAll, selection } = editor;
  const { selectClearing, setRefused } = multi;
  const { gridStep } = prefs;
  const { pages, boxes, margin, cssScale, cssFactor, canvasRefCallback, preview } = session;
  // Called HERE rather than in `wiring.ts` beside `useContainerMarks`, because
  // unlike the marks this value has exactly one consumer — the canvas below.
  // Hoisting it would thread it through four components to reach the one.
  const linkHints = useLinkHints({ boxes, read: editor.read, t, text: editor.text });
  const { status: previewStatus, error: previewError } = preview;

  const manipulate = useMemo<CanvasManipulate>(
    () =>
      canvasManipulate({
        read,
        applyAll,
        selectClearing,
        setRefused,
        grid: gridStep,
      }),
    [read, applyAll, selectClearing, gridStep, setRefused],
  );

  const pageCount = pages.length;

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <CanvasTopbar
        editor={editor}
        multi={multi}
        image={image}
        pdf={pdf}
        treeView={treeView}
        copyNotice={copyNotice}
      />
      <div className="flex min-h-0 flex-1">
        {pageCount >= 2 ? (
          <PageRail
            pages={pages}
            current={Math.min(nav.currentPage, pageCount - 1)}
            onJump={nav.jumpToPage}
          />
        ) : null}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target for palette drops; keyboard insertion goes through the palette itself. */}
        <div
          className="sj-designer-canvas relative flex-1 overflow-auto bg-canvas p-4"
          data-status={previewStatus}
          ref={canvasRefCallback}
          onScroll={nav.onCanvasScroll}
          onDragOver={image.onCanvasDragOver}
          onDrop={image.onCanvasDrop}
        >
          <DesignerCanvas
            pages={pages}
            boxes={boxes}
            scale={cssScale}
            cssFactor={cssFactor}
            pixelRatio={session.pixelRatio}
            selectedPath={selection}
            onSelect={selectClearing}
            multiSelected={multi.multiSel}
            onMultiToggle={multi.toggleMulti}
            onMarquee={multi.marqueeSelect}
            onDeselect={multi.deselectClearing}
            onEditRequest={inline.requestEdit}
            manipulate={manipulate}
            pageSvgRef={drag.pageSvgRef}
            pageRef={nav.pageRef}
            insertIndicator={drag.insertIndicator}
            containerMarks={marks.containerMarks}
            onContextMenu={onContextMenu}
            margin={margin}
            dropWarning={t('canvas.drop.clearsPosition')}
            linkHints={linkHints}
            inlineEdit={
              inline.editing === null
                ? undefined
                : {
                    path: inline.editing.path,
                    value: inline.editing.value,
                    ariaLabel: t('canvas.editLabel'),
                    onCommit: inline.commitEdit,
                    onCancel: inline.cancelEdit,
                    chips: inline.editingChips,
                    flow: inline.editingFlow,
                  }
            }
          />
          {previewError !== null ? (
            <div
              role="alert"
              className="mx-auto mt-3 w-fit rounded-md bg-error-bg px-3 py-2 text-error-text"
            >
              {previewError}
            </div>
          ) : null}
          <CanvasEmptyState read={read} onInsertText={() => inserts.insert('text')} />
        </div>
      </div>
    </div>
  );
}
