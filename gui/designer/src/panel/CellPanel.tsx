// The panel for a selection that has no `type:` of its own. Neither a table
// COLUMN nor a header GROUP is an item, but a canvas click on either cell
// selects its structural path — so this routes to the form for what was
// actually clicked, and falls through to the unsupported card when the path
// resolves to neither (an out-of-range index, a hostile list).
//
// It is a sibling router to `PropertyPanel`, not a section: the sections all
// take `ItemPanelProps`, and a cell has no `ItemView` to build one from.

import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { TOUR_ANCHORS } from '../tutorial/anchors';
import { PANEL } from '../ui/chrome';
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
