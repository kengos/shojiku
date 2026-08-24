// The panel for a selection that has no `type:` of its own. Neither a table
// COLUMN, a header GROUP nor a header/footer BAND is an item, but selecting
// one (a canvas click on a cell, a layer-tree click on a band) hands over its
// structural path — so this routes to the form for what was actually clicked,
// and falls through to the unsupported card when the path resolves to none of
// them (an out-of-range index, a hostile list).
//
// It is a sibling router to `PropertyPanel`, not a section: the sections all
// take `ItemPanelProps`, and a cell has no `ItemView` to build one from.

import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import { bandFromPath } from '../insert/bandCreate';
import type { PaletteGroup } from '../palette/model';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { PANEL } from '../ui/chrome';
import { BandForm } from './BandForm';
import { ColumnForm } from './ColumnForm';
import { columnPathInfo, readColumnsView } from './columnsModel';
import { GroupForm } from './GroupForm';
import { groupPathInfo, readGroupsView } from './groupModel';

export interface CellPanelProps {
  readonly controller: EditorController;
  readonly path: string;
  readonly groups: readonly PaletteGroup[] | null;
  readonly params: string;
  readonly capabilities?: readonly string[];
  readonly formatCatalog?: FormatCatalog | null;
  readonly floor?: Readonly<Record<string, unknown>>;
}

export function CellPanel({
  controller,
  path,
  groups,
  params,
  capabilities,
  formatCatalog,
  floor,
}: CellPanelProps) {
  const { t } = useI18n();
  // Cheapest recognizer first: an exact two-segment string match, no read.
  const band = bandFromPath(path);
  if (band !== null) {
    return <BandForm controller={controller} path={path} band={band} />;
  }
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
        groups={groups}
        params={params}
        capabilities={capabilities}
        formatCatalog={formatCatalog}
        floor={floor}
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
