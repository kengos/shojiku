// The binding pair a table column earns: its `data.key` picker and — once a
// key is picked — its `data.format` picker. Shared by the vertical columns
// section and the single-column form a canvas column selection opens, which
// offer the same controls over the same models and differ only in which path
// and option set they address.
//
// A `cell:` column has a sub-template for content, so it gets neither: the
// two guards are the component's whole contract and stay here rather than at
// the call sites.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import type { ColumnRow } from './columnsModel';
import { FieldPicker } from './FieldPicker';
import { FormatPicker } from './FormatPicker';
import { formatOptions } from './formatModel';
import { bindingKeyOp, bindingPickOps, formatOp } from './model';
import type { PickerOption } from './pickerModel';

export interface ColumnBindingFieldsProps {
  readonly controller: EditorController;
  /** The column's own structural path (`…columns[n]`). */
  readonly path: string;
  readonly column: ColumnRow;
  /** The row-relative binding options ([] when the table is unbound — free
   * entry remains and no scope choice arises). */
  readonly options: readonly PickerOption[];
  /** The document-scope escape's options; `undefined` = no escape offered. */
  readonly documentOptions: readonly PickerOption[] | undefined;
  /** Whether the column resolves through a row scope at all. */
  readonly rowScoped: boolean;
  /** The template `formats:` registry names — read ONCE per section, never
   * per column. */
  readonly formatRegistry: readonly string[];
  /** The engine capability keys — gates the number-field currency variants in
   * the format suggestions (undefined = show). */
  readonly capabilities: readonly string[] | undefined;
}

export function ColumnBindingFields({
  controller,
  path,
  column,
  options,
  documentOptions,
  rowScoped,
  formatRegistry,
  capabilities,
}: ColumnBindingFieldsProps) {
  const { t } = useI18n();
  const dispatch = (op: Op) => {
    controller.apply(op);
  };
  return (
    <>
      {column.hasCell ? null : (
        <FieldPicker
          label={t('panel.field.dataKey')}
          value={column.key}
          options={options}
          documentOptions={documentOptions}
          scope={rowScoped ? column.scope : undefined}
          onCommit={(v) => dispatch(bindingKeyOp(path, v))}
          onPick={
            rowScoped
              ? (key, documentScoped) =>
                  controller.applyAll(bindingPickOps(controller.read, path, key, documentScoped))
              : undefined
          }
        />
      )}
      {/* Format only once the column is bound — a format on an unbound
          column is inert noise. */}
      {column.hasCell || column.key === '' ? null : (
        <FormatPicker
          label={t('panel.field.format')}
          value={column.format}
          options={formatOptions(
            formatRegistry,
            options.find((option) => option.key === column.key)?.type,
            capabilities,
          )}
          onCommit={(v) => dispatch(formatOp(path, v))}
        />
      )}
    </>
  );
}
