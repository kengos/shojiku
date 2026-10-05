// The column form's CONTENT block: what the column renders per row (the kind
// picker — a menu, since four kind names do not fit the panel as segments in
// every locale) and the fields that kind earns — the binding pair for every bound
// kind (`ColumnBindingFields`; no format on an image column, which ignores it),
// the blank-row placeholder on a bound text or QR column, and the fit picker on an
// image column. A `cell:` column gets none of them: its content is a
// sub-template, reached through the form's jump into the cell.
//
// The picker follows the engine's capability keys plus the kind the column
// already has (`offeredKinds`), and is absent when it would offer text alone.
// Each kind carries one line saying what it does with the bound value.

import { Description, Field } from '@headlessui/react';
import type { EditorController } from '../editor/useEditor';
import type { FormatCatalog } from '../engine/types';
import { useI18n } from '../i18n/context';
import { FIELD_LABEL } from '../ui/chrome';
import { Select } from '../ui/Select';
import { ColumnBindingFields } from './ColumnBindingFields';
import { type ColumnKind, offeredKinds } from './columnKinds';
import type { ColumnRow } from './columnsModel';
import { FitField } from './FitField';
import { TextField } from './fields';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp, placeholderOp, plainTextOp } from './model';
import type { PickerOption } from './pickerModel';
import { useColumnKindSwitch } from './useColumnKindSwitch';

export interface ColumnContentFieldsProps {
  readonly controller: EditorController;
  /** The column's own structural path (`…columns[n]`). */
  readonly path: string;
  readonly column: ColumnRow;
  /** What the binding pickers offer — resolved by the form, which owns the
   * row scope. */
  readonly binding: {
    readonly options: readonly PickerOption[];
    readonly documentOptions: readonly PickerOption[] | undefined;
    readonly rowScoped: boolean;
    readonly formatRegistry: readonly string[];
    readonly formatCatalog: FormatCatalog | null;
  };
  readonly capabilities: readonly string[] | undefined;
}

export function ColumnContentFields({
  controller,
  path,
  column,
  binding,
  capabilities,
}: ColumnContentFieldsProps) {
  const { t } = useI18n();
  const kinds = offeredKinds(column.kind, capabilities);
  const kindSwitch = useColumnKindSwitch(controller, path, column.label);
  // Only on a BOUND column: `data.placeholder` without `data.key` would create a
  // binding the engine refuses to parse (`key` is required).
  const placeholder =
    (column.kind === 'text' || column.kind === 'qr_code') &&
    column.key !== '' &&
    hasCapability(capabilities, 'binding.placeholder');
  return (
    <>
      {kinds.length > 1 ? (
        // A Headless `Field`: the listbox button takes the hint below as its
        // DESCRIPTION, so the name stays the label.
        <Field className="mb-2 flex flex-col gap-1">
          <span className={FIELD_LABEL}>{t('panel.column.kind')}</span>
          <Select
            label={t('panel.column.kind')}
            value={column.kind}
            options={kinds.map((kind) => ({ value: kind, label: t(`panel.column.kind.${kind}`) }))}
            onChange={(to) => kindSwitch.request(to as ColumnKind)}
          />
          {column.kind === 'text' ? null : (
            <Description as="p" className="m-0 text-muted text-sm">
              {t(`panel.column.kindHint.${column.kind}`, {
                section: t('panel.tableSection.rows.title'),
                fit: t('panel.field.fit'),
              })}
            </Description>
          )}
          {kindSwitch.dialog}
        </Field>
      ) : null}
      <ColumnBindingFields
        controller={controller}
        path={path}
        column={column}
        options={binding.options}
        documentOptions={binding.documentOptions}
        rowScoped={binding.rowScoped}
        formatRegistry={binding.formatRegistry}
        capabilities={capabilities}
        formatCatalog={binding.formatCatalog}
      />
      {placeholder ? (
        <TextField
          label={t(
            column.kind === 'qr_code' ? 'panel.column.placeholderQr' : 'panel.field.placeholder',
          )}
          value={column.placeholder}
          onCommit={(v) => applyPanelOp(controller, placeholderOp(path, v))}
        />
      ) : null}
      {placeholder && column.kind === 'qr_code' ? (
        <p className="m-0 mb-2 text-muted text-sm">{t('panel.column.placeholderHintQr')}</p>
      ) : null}
      {column.kind === 'image' ? (
        <FitField
          value={column.fit}
          capabilities={capabilities}
          onCommit={(v) => applyPanelOp(controller, plainTextOp(path, ['fit'], v))}
        />
      ) : null}
    </>
  );
}
