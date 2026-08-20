// The property panel's columns section for a selected table: source binding,
// then per-column label / binding / format / ▲▼ reorder / delete / add — each
// ONE designer-core op = one undo step. Thin over the pure `columnsModel` +
// the shared `panel/model` builders; document strings render through React's
// escaping only.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { BTN_SM, INPUT, SECTION_TITLE } from '../ui/chrome';
import { ColumnBindingFields } from './ColumnBindingFields';
import { addColumnOp, moveColumnOp, readColumnsView, removeColumnOp } from './columnsModel';
import { FieldPicker } from './FieldPicker';
import { registryNames } from './itemView';
import { bindingKeyOp, plainTextOp } from './model';
import { pickerOptions, scopeAuthorable } from './pickerModel';
import { sourceOptions, sourceScopeProps } from './sourceScope';

export interface TableColumnsSectionProps {
  readonly controller: EditorController;
  /** The selected table's structural path. */
  readonly tablePath: string;
  /** The table's own `data.key` ('' when unset). */
  readonly dataKey: string;
  /** The table's own `data.scope` ('' when unset) — badges the source picker
   * when the table is itself nested in a row scope. */
  readonly dataScope: string;
  readonly groups: readonly PaletteGroup[] | null;
  readonly params: string;
  /** The engine capability keys — gates the number-field currency variants
   * in the format suggestions and the binding-scope escape (undefined = show). */
  readonly capabilities?: readonly string[];
  /** The engine's format catalog — what each pickable spelling RENDERS. */
  readonly formatCatalog?: FormatCatalog | null;
  /** Open the horizontal column-editor sheet. Absent = no opener. */
  readonly onOpenSheet?: () => void;
}

export function TableColumnsSection({
  controller,
  tablePath,
  dataKey,
  dataScope,
  groups,
  params,
  capabilities,
  formatCatalog = null,
  onOpenSheet,
}: TableColumnsSectionProps) {
  const { t } = useI18n();
  const columns = readColumnsView(controller.read(tablePath)) ?? [];
  // Row-relative options resolve through the table's own binding; an unbound
  // table has no row scope at all, so its columns offer nothing (free entry
  // remains) and no scope choice arises.
  const rowScoped = dataKey !== '';
  const rowOptions = rowScoped ? pickerOptions(groups, dataKey, params) : [];
  // The escape a cell binding needs for a value belonging to the whole
  // document (a store name printed beside every row).
  const documentOptions =
    rowScoped && scopeAuthorable(capabilities) ? pickerOptions(groups, null, params) : undefined;
  // Per-column format suggestions reuse the property panel's type-aware picker:
  // the column's bound field type (resolved through the row options) decides the
  // offered variants; the template `formats:` registry names come first.
  const formatRegistry = registryNames(controller.read('formats'));
  const dispatch = (op: Op) => {
    controller.apply(op);
  };
  return (
    <section className="mb-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className={`${SECTION_TITLE} mb-0`}>{t('panel.section.columns')}</h3>
        {onOpenSheet === undefined ? null : (
          <button type="button" className={BTN_SM} onClick={onOpenSheet}>
            {t('panel.columns.editSheet')}
          </button>
        )}
      </div>
      <FieldPicker
        label={t('panel.field.dataKey')}
        value={dataKey}
        onCommit={(v) => dispatch(bindingKeyOp(tablePath, v))}
        {...sourceScopeProps(controller, tablePath, sourceOptions(groups), dataScope, capabilities)}
      />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {columns.map((column, index) => (
          // Rows are positional document entries; the panel body remounts per
          // revision, so index keys stay true.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional document rows
          <li key={index} className="flex flex-col gap-1 rounded-md border border-border p-1">
            <input
              type="text"
              className={INPUT}
              aria-label={t('panel.column.label')}
              defaultValue={column.label}
              onBlur={(event) => {
                if (event.currentTarget.value !== column.label) {
                  dispatch(
                    plainTextOp(
                      `${tablePath}.columns[${index}]`,
                      ['label'],
                      event.currentTarget.value,
                    ),
                  );
                }
              }}
            />
            <div className="flex justify-end gap-1">
              <button
                type="button"
                className={BTN_SM}
                aria-label={t('panel.column.moveUp')}
                disabled={index === 0}
                onClick={() => dispatch(moveColumnOp(tablePath, index, index - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                className={BTN_SM}
                aria-label={t('panel.column.moveDown')}
                disabled={index === columns.length - 1}
                onClick={() => dispatch(moveColumnOp(tablePath, index, index + 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className={BTN_SM}
                aria-label={t('panel.column.remove')}
                onClick={() => dispatch(removeColumnOp(tablePath, index))}
              >
                ×
              </button>
            </div>
            <ColumnBindingFields
              controller={controller}
              path={`${tablePath}.columns[${index}]`}
              column={column}
              options={rowOptions}
              documentOptions={documentOptions}
              rowScoped={rowScoped}
              formatRegistry={formatRegistry}
              formatCatalog={formatCatalog}
              capabilities={capabilities}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={BTN_SM}
        onClick={() =>
          dispatch(addColumnOp(tablePath, columns.length, t('panel.column.defaultLabel')))
        }
      >
        {t('panel.column.add')}
      </button>
    </section>
  );
}
