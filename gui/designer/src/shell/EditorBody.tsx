// The main editing area: the three-column grid (tool pane · canvas · property
// panel) and the two fullscreen views that replace it wholesale. A fullscreen
// view takes the WHOLE area — its own section rail replaces the pane's
// navigation, so leaving the pane beside it would put two navigation columns on
// one screen.
//
// Each column is its own child and owns the derivation it needs: `SidePane`,
// `CanvasArea` (direct manipulation), `PanelColumn` (placement geometry). This
// file is the grid and the fullscreen switch, nothing else.

import type { EditorController } from '../editor/useEditor';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { ContainerMarks } from '../hooks/useContainerMarks';
import type { DefinitionsOwnership } from '../hooks/useDefinitionsOwnership';
import type { DocDerived } from '../hooks/useDocDerived';
import type { DocViews } from '../hooks/useDocViews';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { ImageImport } from '../hooks/useImageImport';
import type { InlineEdit } from '../hooks/useInlineEdit';
import type { InsertActions } from '../hooks/useInsertActions';
import type { MultiSelect } from '../hooks/useMultiSelect';
import type { PageNav } from '../hooks/usePageNav';
import type { PaletteDragWiring } from '../hooks/usePaletteDrag';
import type { PdfAction } from '../hooks/usePdfAction';
import type { PreviewSession } from '../hooks/usePreviewSession';
import type { SampleData } from '../hooks/useSampleData';
import type { SelectionOps } from '../hooks/useSelectionOps';
import type { TutorialWiring } from '../hooks/useTutorialWiring';
import type { HostConfig } from '../hostConfig';
import { CanvasArea } from './CanvasArea';
import { FullscreenView } from './FullscreenView';
import { PanelColumn } from './PanelColumn';
import { SidePane } from './SidePane';

export interface EditorBodyProps {
  readonly editor: EditorController;
  readonly views: DocViews;
  readonly prefs: EditorPrefs;
  readonly defs: DefinitionsOwnership;
  readonly sample: SampleData;
  readonly derived: DocDerived;
  readonly multi: MultiSelect;
  readonly nav: PageNav;
  readonly drag: PaletteDragWiring;
  readonly image: ImageImport;
  readonly inline: InlineEdit;
  readonly marks: ContainerMarks;
  readonly pdf: PdfAction;
  readonly inserts: InsertActions;
  readonly selectionOps: SelectionOps;
  readonly uiEvent: TutorialWiring['uiEvent'];
  /** The preview half of the editing session — pages, boxes, the last-good
   * render and its freshness, the zoom-derived scales. */
  readonly session: PreviewSession;
  /** The resolved host configuration (defaults already applied). */
  readonly host: HostConfig;
  /** The session's template-size cap (`useTemplateCap`). */
  readonly maxBytes: number;
  /** The Designer-local dialog flags. */
  readonly dialogs: ChromeDialogs;
  readonly onParamsChange: (params: string) => void;
}

export function EditorBody({
  editor,
  views,
  prefs,
  defs,
  sample,
  derived,
  multi,
  nav,
  drag,
  image,
  inline,
  marks,
  pdf,
  inserts,
  selectionOps,
  uiEvent,
  session,
  host,
  maxBytes,
  dialogs,
  onParamsChange,
}: EditorBodyProps) {
  const { docViewOpen, dataViewOpen } = views;
  const fullscreen = docViewOpen || dataViewOpen;

  return (
    <div
      className="grid min-h-0 flex-1"
      style={{
        // Column 1 is the resizable pane; collapsing swaps it for a narrow
        // rail that keeps the re-open control on screen (gdoc-style).
        gridTemplateColumns: fullscreen
          ? 'minmax(0,1fr)'
          : `${prefs.sidebarCollapsed ? '2.25rem' : `${prefs.sidebarWidth}px`} minmax(0,1fr) 280px`,
      }}
    >
      {fullscreen ? null : (
        <SidePane
          editor={editor}
          prefs={prefs}
          treeView={derived.treeView}
          effectiveDefinitions={defs.effectiveDefinitions}
          paletteDrag={drag.paletteDrag}
          uiEvent={uiEvent}
          onContextMenu={selectionOps.openContextMenu}
          onOpenDocument={() => views.openDocView()}
          onOpenDataEditor={views.openDataView}
          onOpenDataField={views.openDataField}
        />
      )}
      {fullscreen ? (
        <FullscreenView
          editor={editor}
          views={views}
          defs={defs}
          sample={sample}
          derived={derived}
          session={session}
          host={host}
          maxBytes={maxBytes}
          onParamsChange={onParamsChange}
        />
      ) : (
        <>
          <CanvasArea
            editor={editor}
            prefs={prefs}
            multi={multi}
            nav={nav}
            drag={drag}
            image={image}
            inline={inline}
            marks={marks}
            pdf={pdf}
            inserts={inserts}
            treeView={derived.treeView}
            session={session}
            onContextMenu={selectionOps.openContextMenu}
          />
          <PanelColumn
            editor={editor}
            views={views}
            prefs={prefs}
            defs={defs}
            sample={sample}
            derived={derived}
            multi={multi}
            marks={marks}
            image={image}
            inserts={inserts}
            selectionOps={selectionOps}
            session={session}
            host={host}
            dialogs={dialogs}
          />
        </>
      )}
    </div>
  );
}
