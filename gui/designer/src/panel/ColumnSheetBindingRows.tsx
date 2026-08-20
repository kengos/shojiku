// The two BINDING rows of the horizontal column sheet: which params key each
// column reads, and which format it displays. Split from the sheet because
// these are the only rows whose cell is conditional on the column's KIND — a
// `cell:` column's content is a sub-template, so it has no binding and no
// format, and an unbound column's format would be inert noise. Both rows show a
// muted placeholder there rather than an empty grid cell, so the grid stays
// legible as a table.
//
// The sheet owns the grid; these are the cells that go in two of its rows.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { ColumnSheetData } from './columnSheetData';
import type { ColumnRow } from './columnsModel';
import { FieldPicker } from './FieldPicker';
import { FormatPicker } from './FormatPicker';
import { bindingKeyOp, bindingPickOps, formatOp } from './model';
import { MutedCell, RowLabel } from './TableColumnCells';

export interface ColumnSheetBindingRowsProps {
  readonly controller: EditorController;
  readonly columns: readonly ColumnRow[];
  /** `<tablePath>.columns` — each cell addresses `[index]` under it. */
  readonly columnsPath: string;
  readonly data: ColumnSheetData;
  readonly dispatch: (op: Op | null) => void;
}

export function ColumnSheetBindingRows({
  controller,
  columns,
  columnsPath,
  data,
  dispatch,
}: ColumnSheetBindingRowsProps) {
  const { t } = useI18n();
  const { rowScoped, rowOptions, documentOptions, formatRowsFor } = data;
  const at = (index: number) => `${columnsPath}[${index}]`;
  return (
    <>
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
            onCommit={(v) => dispatch(bindingKeyOp(at(index), v))}
            onPick={
              rowScoped
                ? (key, documentScoped) =>
                    controller.applyAll(
                      bindingPickOps(controller.read, at(index), key, documentScoped),
                    )
                : undefined
            }
          />
        ),
      )}

      {/* Format row — only a bound, non-cell column. */}
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
            options={formatRowsFor(column.key)}
            onCommit={(v) => dispatch(formatOp(at(index), v))}
          />
        ),
      )}
    </>
  );
}
