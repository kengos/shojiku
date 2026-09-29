// Two of the table's content-tab section bodies — 「Rows and cells」 (how tall
// the body and header rows are, the cell padding) and 「When there is no data」
// (what an empty array draws, whether empty cells merge) — plus the context
// every table-settings body takes. The page switches are `TablePageFields`, the
// header groups `TableGroupList`; `TableContentSections` wraps each body in its
// collapsible section. Thin over the pure `tableSettingsModel` (read) and
// `tableSettingsOps` (write); every control is ONE edit, i.e. one undo step, and
// a control the engine would reject the key for is absent rather than disabled.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { useI18n } from '../i18n/context';
import { Field } from './fields';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp } from './model';
import { StepperField } from './StepperField';
import { TableRowHeights } from './TableRowHeights';
import { readTableSettings } from './tableSettingsModel';
import {
  canStepCellPadding,
  cellPaddingOp,
  cellPaddingStepOp,
  emptyBehaviorOp,
  flagToggleOp,
} from './tableSettingsOps';

/** Everything the section needs, and nothing about where it is hosted. */
export interface TableSettingsContext {
  /** The table item's structural path. */
  readonly path: string;
  readonly controller: EditorController;
  readonly capabilities: readonly string[] | undefined;
  /** Move the selection — the header group a new-group click creates. */
  readonly onSelectPath?: (path: string) => void;
}

/** The 「Rows and cells」 section's body: the row heights (behind
 * `table.row.height`), then the cell padding. */
export function TableRowsBody({ context }: { readonly context: TableSettingsContext }) {
  const { t } = useI18n();
  const { path, controller, capabilities } = context;
  const view = readTableSettings(controller.read(path));
  return (
    <>
      {hasCapability(capabilities, 'table.row.height') ? (
        <TableRowHeights context={context} view={view} />
      ) : null}
      <StepperField
        label={t('panel.tableSettings.cellPadding')}
        value={view.cellPadding}
        unit="pt"
        placeholder="4"
        inputMode="decimal"
        canStep={canStepCellPadding(view.cellPadding)}
        onCommit={(raw) => applyPanelOp(controller, cellPaddingOp(path, view.cellPadding, raw))}
        onStep={(dir) => applyPanelOp(controller, cellPaddingStepOp(path, view.cellPadding, dir))}
      />
    </>
  );
}

/** The 「When there is no data」 section's body: what an empty array draws, and
 * whether empty cells merge (behind `table.mergeEmptyCells`). */
export function TableEmptyBody({ context }: { readonly context: TableSettingsContext }) {
  const { t } = useI18n();
  const { path, controller, capabilities } = context;
  const view = readTableSettings(controller.read(path));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <>
      <Field label={t('panel.tableSettings.empty')}>
        <select
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-text"
          value={view.emptyBehavior}
          onChange={(event) =>
            dispatch(emptyBehaviorOp(path, view.emptyBehavior, event.currentTarget.value))
          }
        >
          <option value="collapse">{t('panel.tableSettings.empty.collapse')}</option>
          <option value="reserve">{t('panel.tableSettings.empty.reserve')}</option>
        </select>
      </Field>
      {hasCapability(capabilities, 'table.mergeEmptyCells') ? (
        <label className="mb-2 flex items-center gap-1.5 text-sm text-text">
          <input
            type="checkbox"
            checked={view.mergeEmptyCells}
            onChange={() => dispatch(flagToggleOp(path, 'mergeEmptyCells', view.mergeEmptyCells))}
          />
          {t('panel.tableSettings.mergeEmptyCells')}
        </label>
      ) : null}
    </>
  );
}
