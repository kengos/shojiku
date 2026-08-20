// The horizontal table-column editor shown in the bottom Offcanvas
// sheet. Where `TableColumnsSection` stacks columns VERTICALLY in the property
// panel, this transposes them: one column per table column, the rows being the
// properties (label / data key / width / format) plus a read-only sample-data
// preview row. Header cells drag-reorder (or Alt+Arrow) — ONE `moveItem` per
// reorder. Thin over the SAME pure `columnsModel` + `panel/model` builders the
// vertical section uses (AI parity: every edit is an existing op); the document
// is untrusted, so hostile/empty column entries still yield a strip (indices
// stay true) and every value renders through React's escaping only.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { ColumnSheetBindingRows } from './ColumnSheetBindingRows';
import { columnSheetData } from './columnSheetData';
import { readColumnsView } from './columnsModel';
import { applyPanelOp, lengthOp, plainTextOp } from './model';
import {
  ColumnAlignRow,
  ColumnHeaderRow,
  ColumnLabelCell,
  ColumnSampleCell,
  ColumnWidthCell,
  RowLabel,
} from './TableColumnCells';
import { useColumnHeaderDrag } from './useColumnHeaderDrag';

export interface TableColumnSheetProps {
  readonly controller: EditorController;
  /** The selected table's structural path. */
  readonly tablePath: string;
  /** The table's own `data.key` ('' when unset) — the row scope for the
   * per-column bindings and the sample preview. */
  readonly dataKey: string;
  readonly groups: readonly PaletteGroup[] | null;
  readonly params: string;
  /** The engine capability keys — gates the number-field currency variants
   * in the format suggestions and the binding-scope escape (undefined = show). */
  readonly capabilities?: readonly string[];
  /** The engine's format catalog — what each pickable spelling RENDERS. */
  readonly formatCatalog?: FormatCatalog | null;
}

export function TableColumnSheet({
  controller,
  tablePath,
  dataKey,
  groups,
  params,
  capabilities,
  formatCatalog = null,
}: TableColumnSheetProps) {
  const { t } = useI18n();
  const columns = readColumnsView(controller.read(tablePath)) ?? [];
  const columnsPath = `${tablePath}.columns`;
  const sheet = columnSheetData({
    read: controller.read,
    tablePath,
    dataKey,
    groups,
    params,
    capabilities,
    formatCatalog,
  });
  const { sampleFor, alignFor } = sheet;
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  const headerDrag = useColumnHeaderDrag(tablePath, columns.length, dispatch);

  if (columns.length === 0) {
    return <p className="m-0 text-muted">{t('sheet.columns.empty')}</p>;
  }

  return (
    // No body-wide revision remount: each editable cell reseeds on its OWN value
    // (raw inputs are value-keyed; the pickers self-reseed internally), so a
    // commit in one cell never discards an in-progress edit in another — the
    // read-only/positional cells (header, sample) just re-render in place, which
    // is correct when a reorder swaps the data at a position.
    <div
      className="grid w-max gap-1"
      style={{ gridTemplateColumns: `auto repeat(${columns.length}, 160px)` }}
    >
      <ColumnHeaderRow
        columns={columns}
        drag={headerDrag}
        reorderLabel={t('sheet.columns.reorder')}
      />

      {/* Label row. */}
      <RowLabel>{t('panel.column.label')}</RowLabel>
      {columns.map((column, index) => (
        <ColumnLabelCell
          // Value in the key so the cell reseeds on its own change (edit, undo,
          // reorder) but survives a sibling commit; index keeps it position-unique.
          // biome-ignore lint/suspicious/noArrayIndexKey: position-unique on purpose; see the reseed note above.
          key={`l${index}:${column.label}`}
          label={t('panel.column.label')}
          value={column.label}
          onCommit={(next) => dispatch(plainTextOp(`${columnsPath}[${index}]`, ['label'], next))}
        />
      ))}

      {/* Width row. */}
      <RowLabel>{t('panel.column.width')}</RowLabel>
      {columns.map((column, index) => (
        <ColumnWidthCell
          // Value in the key so the cell reseeds on its own change (edit, undo,
          // reorder) but survives a sibling commit; index keeps it position-unique.
          // biome-ignore lint/suspicious/noArrayIndexKey: position-unique on purpose; see the reseed note above.
          key={`w${index}:${column.width}`}
          label={t('panel.column.width')}
          value={column.width}
          onCommit={(next) => dispatch(lengthOp(`${columnsPath}[${index}]`, ['width'], next))}
        />
      ))}

      <ColumnSheetBindingRows
        controller={controller}
        columns={columns}
        columnsPath={columnsPath}
        data={sheet}
        dispatch={dispatch}
      />

      {/* Alignment row — the one style property worth comparing ACROSS columns
          (a money column right, a quantity column centred), which is what this
          transposed sheet is for. The rest of a column's styling lives in the
          single-column form. */}
      <RowLabel>{t('panel.field.textAlign')}</RowLabel>
      <ColumnAlignRow
        columns={columns}
        columnsPath={columnsPath}
        alignFor={alignFor}
        onOp={dispatch}
      />

      {/* Read-only sample-data preview row, drawn under the alignment above it. */}
      <RowLabel>{t('sheet.columns.sample')}</RowLabel>
      {columns.map((column, index) => (
        <ColumnSampleCell
          // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only, so it re-renders in place when a reorder swaps the data at this position
          key={`s${index}`}
          value={sampleFor(column)}
          textAlign={column.textAlign}
        />
      ))}
    </div>
  );
}
