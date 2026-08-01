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
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { parseParams } from '../sample/model';
import { type ColumnRow, readColumnsView } from './columnsModel';
import { FieldPicker } from './FieldPicker';
import { FormatPicker } from './FormatPicker';
import { formatOptions } from './formatModel';
import { registryNames } from './itemView';
import {
  applyPanelOp,
  bindingKeyOp,
  bindingPickOps,
  formatOp,
  lengthOp,
  plainTextOp,
} from './model';
import { pickerOptions, sampleValueFor, scopeAuthorable } from './pickerModel';
import {
  ColumnHeaderRow,
  ColumnLabelCell,
  ColumnSampleCell,
  ColumnWidthCell,
  MutedCell,
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
}

export function TableColumnSheet({
  controller,
  tablePath,
  dataKey,
  groups,
  params,
  capabilities,
}: TableColumnSheetProps) {
  const { t } = useI18n();
  const columns = readColumnsView(controller.read(tablePath)) ?? [];
  const columnsPath = `${tablePath}.columns`;
  // Row-relative options resolve through the table's own binding (an unbound
  // table offers no row fields — free entry remains, the wrong document-scope
  // fields never leak in). Sample values sample the same row scope.
  const rowScoped = dataKey !== '';
  const rowOptions = rowScoped ? pickerOptions(groups, dataKey, params) : [];
  // The same document-scope escape the vertical section offers: a value that
  // belongs to the whole document rather than the row.
  const documentOptions =
    rowScoped && scopeAuthorable(capabilities) ? pickerOptions(groups, null, params) : undefined;
  const sampleRoot = parseParams(params);
  const formatRegistry = registryNames(controller.read('formats'));
  const columnFormatRows = (key: string) =>
    formatOptions(
      formatRegistry,
      rowOptions.find((option) => option.key === key)?.type,
      capabilities,
    );

  // A `cell:`/unbound column, or an unbound table, has no row value to preview.
  const sampleFor = (column: ColumnRow) =>
    column.hasCell || column.key === '' || !rowScoped
      ? undefined
      : sampleValueFor(sampleRoot, dataKey, column.key);

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

      {/* Data-key row (a `cell:` column's content is a sub-template — no binding). */}
      <RowLabel>{t('panel.field.dataKey')}</RowLabel>
      {columns.map((column, index) =>
        column.hasCell ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only or self-reseeding internally, so it re-renders in place when a reorder swaps the data at this position
          <MutedCell key={`k${index}`} />
        ) : (
          <FieldPicker
            // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only or self-reseeding internally, so it re-renders in place when a reorder swaps the data at this position
            key={`k${index}`}
            label={t('panel.field.dataKey')}
            value={column.key}
            options={rowOptions}
            documentOptions={documentOptions}
            scope={rowScoped ? column.scope : undefined}
            onCommit={(v) => dispatch(bindingKeyOp(`${columnsPath}[${index}]`, v))}
            onPick={
              rowScoped
                ? (key, documentScoped) =>
                    controller.applyAll(
                      bindingPickOps(
                        controller.read,
                        `${columnsPath}[${index}]`,
                        key,
                        documentScoped,
                      ),
                    )
                : undefined
            }
          />
        ),
      )}

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

      {/* Format row — only a bound, non-cell column (a format on an
          unbound column is inert noise). */}
      <RowLabel>{t('panel.field.format')}</RowLabel>
      {columns.map((column, index) =>
        column.hasCell || column.key === '' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only or self-reseeding internally, so it re-renders in place when a reorder swaps the data at this position
          <MutedCell key={`f${index}`} />
        ) : (
          <FormatPicker
            // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only or self-reseeding internally, so it re-renders in place when a reorder swaps the data at this position
            key={`f${index}`}
            label={t('panel.field.format')}
            value={column.format}
            options={columnFormatRows(column.key)}
            onCommit={(v) => dispatch(formatOp(`${columnsPath}[${index}]`, v))}
          />
        ),
      )}

      {/* Read-only sample-data preview row. */}
      <RowLabel>{t('sheet.columns.sample')}</RowLabel>
      {columns.map((column, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional cell — read-only, so it re-renders in place when a reorder swaps the data at this position
        <ColumnSampleCell key={`s${index}`} value={sampleFor(column)} />
      ))}
    </div>
  );
}
