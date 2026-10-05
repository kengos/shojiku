// One column's cell in the column sheet's 「列の種類」 row: what the column
// renders per row, as a picker over the kinds the engine offers for it — the
// same door (`useColumnKindSwitch`), and so the same confirm, as the column
// form's picker. Comparing kinds across columns is what the transposed sheet
// is for; the fields a kind earns (fit, blank-row text) stay in the form.
//
// A column the engine offers nothing else for shows its kind as plain text.

import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { Select } from '../ui/Select';
import {
  COLUMN_CELL_CAPABILITY,
  COLUMN_TYPE_CAPABILITY,
  type ColumnKind,
  offeredKinds,
} from './columnKinds';
import type { ColumnRow } from './columnsModel';
import { hasCapability } from './itemPanelProps';
import { useColumnKindSwitch } from './useColumnKindSwitch';

/** Whether the sheet carries the row at all: some column has a kind to switch
 * to, or already renders something other than text. */
export function sheetShowsKinds(
  columns: readonly ColumnRow[],
  capabilities: readonly string[] | undefined,
): boolean {
  return (
    hasCapability(capabilities, COLUMN_TYPE_CAPABILITY) ||
    hasCapability(capabilities, COLUMN_CELL_CAPABILITY) ||
    columns.some((column) => column.kind !== 'text')
  );
}

export interface ColumnKindCellProps {
  readonly controller: EditorController;
  /** The column's own structural path (`…columns[n]`). */
  readonly path: string;
  readonly column: ColumnRow;
  readonly capabilities: readonly string[] | undefined;
}

export function ColumnKindCell({ controller, path, column, capabilities }: ColumnKindCellProps) {
  const { t } = useI18n();
  const kindSwitch = useColumnKindSwitch(controller, path, column.label);
  const kinds = offeredKinds(column.kind, capabilities);
  const name = (kind: ColumnKind) => t(`panel.column.kind.${kind}`);
  if (kinds.length === 1) {
    return <span className="self-center px-2 text-sm">{name(column.kind)}</span>;
  }
  return (
    <>
      <Select
        value={column.kind}
        options={kinds.map((kind) => ({ value: kind, label: name(kind) }))}
        onChange={(to) => kindSwitch.request(to as ColumnKind)}
        // Every column's picker sits in one row: each is named for its column.
        label={
          column.label === ''
            ? t('panel.column.kind')
            : t('panel.column.kindFor', { label: column.label })
        }
      />
      {kindSwitch.dialog}
    </>
  );
}
