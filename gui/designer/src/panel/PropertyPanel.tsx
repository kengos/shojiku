// The property panel router: it reads the selection through the editor
// and dispatches to one of three surfaces — the per-item tabbed editor
// (`ItemPanel`, content/decoration/placement), a table column's form (`ColumnForm`), or, with
// nothing selected, a compact hint card pointing at the fullscreen document-
// settings view (settings moved out of the panel into their own surface).
// It holds no field logic itself; each surface dispatches its own named
// `designer-core` op (AI parity). The panel is a live view — it re-reads
// `controller.read(path)` every render, so an edit → op → re-serialize → re-read
// shows the new value.

import { useMemo } from 'react';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { readDefinitionsView } from '../palette/model';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { BTN, PANEL, PANEL_FLUSH } from '../ui/chrome';
import { ColumnForm } from './ColumnForm';
import { columnPathInfo, readColumnsView } from './columnsModel';
import { GroupForm } from './GroupForm';
import { groupPathInfo, readGroupsView } from './groupModel';
import { ItemPanel } from './ItemPanel';
import { readItemView } from './itemView';
import type { DefaultsSection } from './OriginBadge';
import type { PlacementGeometry } from './placementGeometry';

export interface PropertyPanelProps {
  readonly controller: EditorController;
  readonly path: string | null;
  /** Host-supplied `fontFamily` suggestions (e.g. fonts the host installed). */
  readonly fontFamilies?: readonly string[];
  /** The engine's capability keys — a field whose wire feature the engine lacks
   * is hidden (undefined = show every field). Never version-sniff. */
  readonly capabilities?: readonly string[];
  /** The engine-default floor for the cascade mirror (unset inherited style →
   * its real engine default, shown with the default-origin badge). Threaded to the item panel. */
  readonly floor?: Readonly<Record<string, unknown>>;
  /** The EFFECTIVE definitions YAML (engineer schema, or the workshop mode stub). */
  readonly definitions?: string;
  /** The active sample params JSON — the picker's live sample values. */
  readonly params?: string;
  /** The canvas grid step (pt) — the box steppers' increment (0/off → 1pt). */
  readonly gridStep?: number;
  /** The resolved-geometry inputs for the placement tab's auto/fixed modes (inspect
   * boxes + margins + freshness); `null` when no fresh render backs them. */
  readonly geometry?: PlacementGeometry | null;
  /** Open the image import pipeline to REPLACE the `src` of the image at `path`. */
  readonly onReplaceImage?: (path: string, currentSrcLength: number) => void;
  /** workshop mode: open the create-data-field modal from a document-scope
   * data.key picker tail; the picker hands its commit up to bind the item. */
  readonly onCreateField?: (bindKey: (key: string) => void) => void;
  /** Open the horizontal column-editor sheet for a selected table. */
  readonly onOpenColumnSheet?: () => void;
  /** A style field's origin-hint jump: the Designer clears the selection and
   * opens the document-settings view at the section that owns the resolved
   * value. */
  readonly onNavigateDefaults?: (section: DefaultsSection) => void;
  /** Open the glossary (a HelpHint's "learn more"). */
  readonly onOpenGlossary?: () => void;
  /** Open the fullscreen document-settings view (the no-selection card's CTA). */
  readonly onOpenDocument?: () => void;
  /** Jump the shared selection (the parent-container card's select-parent). */
  readonly onSelectPath?: (path: string) => void;
  /** Highlight a container on canvas (parent-card hover); `null` clears. */
  readonly onHighlight?: (path: string | null) => void;
  /** wrap-in-container — wrap the selected item in a new container (the
   * right-click's keyboard companion); present only for a wrappable selection. */
  readonly onWrap?: (path: string) => void;
}

export function PropertyPanel({
  controller,
  path,
  fontFamilies = [],
  capabilities,
  floor,
  definitions,
  params = '',
  gridStep = 0,
  geometry = null,
  onReplaceImage,
  onCreateField,
  onOpenColumnSheet,
  onNavigateDefaults,
  onOpenGlossary,
  onOpenDocument,
  onSelectPath,
  onHighlight,
  onWrap,
}: PropertyPanelProps) {
  const { t } = useI18n();

  const paletteGroups = useMemo(
    () => (definitions === undefined ? null : readDefinitionsView(definitions)),
    [definitions],
  );

  // A selection pointing at a node that no longer exists reads as undefined —
  // treat it like no selection.
  const raw = path === null ? undefined : controller.read(path);
  if (path === null || raw === undefined) {
    // Nothing selected: a compact hint pointing at the document-settings view
    // (the settings themselves live there now, not in the panel).
    return (
      <aside data-tour={TOUR_ANCHORS.panel} className={PANEL} aria-label={t('panel.title')}>
        <p className="m-0 mb-3 text-sm text-muted">{t('panel.noSelection.hint')}</p>
        {onOpenDocument !== undefined ? (
          <button
            type="button"
            className={BTN}
            data-tour={TOUR_ANCHORS.panelDocSettings}
            onClick={onOpenDocument}
          >
            {t('panel.noSelection.open')}
          </button>
        ) : null}
      </aside>
    );
  }

  const view = readItemView(raw);
  if (view === null) {
    // Neither a table column nor a header group has a `type:` of its own, but a
    // canvas click on either cell selects its structural path — give each the
    // form for what was actually clicked.
    const columnInfo = columnPathInfo(path);
    const column =
      columnInfo === null
        ? undefined
        : readColumnsView(controller.read(columnInfo.tablePath))?.[columnInfo.index];
    if (column !== undefined) {
      return (
        <ColumnForm
          controller={controller}
          path={path}
          column={column}
          groups={paletteGroups}
          params={params}
          capabilities={capabilities}
        />
      );
    }
    const groupInfo = groupPathInfo(path);
    if (groupInfo !== null) {
      // An absent/hostile `headerGroups` list reads as no rows, so an
      // out-of-range index falls through to the unsupported card either way.
      const rows = readGroupsView(controller.read(groupInfo.tablePath)) ?? [];
      const group = rows[groupInfo.index];
      if (group !== undefined) {
        return (
          <GroupForm
            controller={controller}
            path={path}
            tablePath={groupInfo.tablePath}
            index={groupInfo.index}
            group={group}
            groups={rows}
          />
        );
      }
    }
    return (
      <aside data-tour={TOUR_ANCHORS.panel} className={PANEL} aria-label={t('panel.title')}>
        <p className="m-0 text-muted">{t('panel.unsupported')}</p>
      </aside>
    );
  }

  return (
    <aside data-tour={TOUR_ANCHORS.panel} className={PANEL_FLUSH} aria-label={t('panel.title')}>
      <ItemPanel
        controller={controller}
        path={path}
        view={view}
        fontFamilies={fontFamilies}
        capabilities={capabilities}
        floor={floor}
        paletteGroups={paletteGroups}
        params={params}
        gridStep={gridStep}
        geometry={geometry}
        onReplaceImage={onReplaceImage}
        onCreateField={onCreateField}
        onOpenColumnSheet={onOpenColumnSheet}
        onNavigateDefaults={onNavigateDefaults}
        onOpenGlossary={onOpenGlossary}
        onSelectPath={onSelectPath}
        onHighlight={onHighlight}
        onWrap={onWrap}
      />
    </aside>
  );
}
