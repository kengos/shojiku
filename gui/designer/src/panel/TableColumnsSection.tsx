// The body of the 「Columns」 section for a selected table (the heading is
// `TableContentSections`'): source binding, then per-column label / ▲▼ reorder /
// delete / what a non-text column renders / binding / format, then add and the
// column-sheet opener — each
// ONE designer-core op = one undo step. Thin over the pure `columnsModel` +
// the shared `panel/model` builders; document strings render through React's
// escaping only.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import type { PaletteGroup } from '../palette/model';
import { BTN_SM, BTN_SM_ICON, INPUT } from '../ui/chrome';
import { IconChevronDown, IconChevronUp, IconClose } from '../ui/icons';
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
    <>
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
                className={BTN_SM_ICON}
                aria-label={t('panel.column.moveUp')}
                disabled={index === 0}
                onClick={() => dispatch(moveColumnOp(tablePath, index, index - 1))}
              >
                <IconChevronUp size={14} />
              </button>
              <button
                type="button"
                className={BTN_SM_ICON}
                aria-label={t('panel.column.moveDown')}
                disabled={index === columns.length - 1}
                onClick={() => dispatch(moveColumnOp(tablePath, index, index + 1))}
              >
                <IconChevronDown size={14} />
              </button>
              <button
                type="button"
                className={BTN_SM_ICON}
                aria-label={t('panel.column.remove')}
                onClick={() => dispatch(removeColumnOp(tablePath, index))}
              >
                <IconClose size={14} />
              </button>
            </div>
            {/* What a non-text column renders, as plain text — switching it is
                the column form's job, so nothing here looks pressable. */}
            {column.kind === 'text' ? null : (
              <span className="text-muted text-xs">
                {t('panel.column.kindTag', { kind: t(`panel.column.kind.${column.kind}`) })}
              </span>
            )}
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
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN_SM}
          onClick={() =>
            dispatch(addColumnOp(tablePath, columns.length, t('panel.column.defaultLabel')))
          }
        >
          {t('panel.column.add')}
        </button>
        {onOpenSheet === undefined ? null : (
          <button type="button" className={BTN_SM} onClick={onOpenSheet}>
            {t('panel.columns.editSheet')}
          </button>
        )}
      </div>
    </>
  );
}
