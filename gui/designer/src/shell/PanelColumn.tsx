// The editing grid's RIGHT column: the property panel over the last-good
// placement geometry. The third of the three column children (tool pane ·
// canvas · panel), and like the other two it owns the derivation its column
// needs — here the `placementGeometry` memo, whose freshness rule exists only
// for this panel.

import { useMemo } from 'react';
import type { EditorController } from '../editor/useEditor';
import type { ChromeDialogs } from '../hooks/useChromeDialogs';
import type { ContainerMarks } from '../hooks/useContainerMarks';
import type { DefinitionsOwnership } from '../hooks/useDefinitionsOwnership';
import type { DocDerived } from '../hooks/useDocDerived';
import type { DocViews } from '../hooks/useDocViews';
import type { EditorPrefs } from '../hooks/useEditorPrefs';
import type { ImageImport } from '../hooks/useImageImport';
import type { InsertActions } from '../hooks/useInsertActions';
import type { MultiSelect } from '../hooks/useMultiSelect';
import type { PreviewSession } from '../hooks/usePreviewSession';
import type { SampleData } from '../hooks/useSampleData';
import type { SelectionOps } from '../hooks/useSelectionOps';
import type { HostConfig } from '../hostConfig';
import { isWrappablePath } from '../insert/wrap';
import { PropertyPanel } from '../panel/PropertyPanel';
import type { PlacementGeometry } from '../panel/placementGeometry';

export interface PanelColumnProps {
  readonly editor: EditorController;
  readonly views: DocViews;
  readonly prefs: EditorPrefs;
  readonly defs: DefinitionsOwnership;
  readonly sample: SampleData;
  readonly derived: DocDerived;
  readonly multi: MultiSelect;
  readonly marks: ContainerMarks;
  readonly image: ImageImport;
  readonly inserts: InsertActions;
  readonly selectionOps: SelectionOps;
  readonly session: PreviewSession;
  readonly host: HostConfig;
  readonly dialogs: ChromeDialogs;
}

export function PanelColumn({
  editor,
  views,
  prefs,
  defs,
  sample,
  derived,
  multi,
  marks,
  image,
  inserts,
  selectionOps,
  session,
  host,
  dialogs,
}: PanelColumnProps) {
  // Locals, not property reads: memo dependencies must be the stable fields
  // (never the per-render bundle), and narrowing follows a local binding.
  const { selection } = editor;
  const { imageCodec } = host;
  const { preview, fresh } = session;
  const { lastGood } = preview;

  // The placement tab's placement geometry: the last-good inspect boxes + margins,
  // tagged FRESH only when the shown render corresponds to the live document,
  // so the panel never seeds a pin from geometry the document has moved past.
  const placementGeometry = useMemo<PlacementGeometry | null>(() => {
    const inspect = lastGood?.inspect;
    if (inspect === undefined || inspect === null) {
      return null;
    }
    return { boxes: inspect.boxes, margin: inspect.margin, fresh };
  }, [lastGood, fresh]);

  return (
    <PropertyPanel
      controller={editor}
      path={selection}
      fontFamilies={host.fontFamilies}
      capabilities={host.capabilities}
      formatCatalog={derived.formats.catalog}
      floor={derived.styleFloor}
      definitions={defs.effectiveDefinitions}
      params={sample.params}
      gridStep={prefs.gridStep}
      geometry={placementGeometry}
      onReplaceImage={imageCodec !== undefined ? image.onReplaceImage : undefined}
      onCreateField={inserts.onCreateField}
      onOpenColumnSheet={dialogs.openColumnSheet}
      onNavigateDefaults={views.navigateDefaults}
      onOpenGlossary={dialogs.openGlossary}
      onOpenDocument={() => views.openDocView()}
      onSelectPath={multi.selectClearing}
      onHighlight={marks.setHighlightPath}
      onWrap={
        selection !== null && isWrappablePath(selection) ? selectionOps.wrapSelected : undefined
      }
      onTextDraft={session.setDraftOps}
    />
  );
}
