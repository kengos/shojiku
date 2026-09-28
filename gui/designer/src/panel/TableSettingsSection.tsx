// The table's row and page settings, below the columns in the content tab: how
// tall the body and header rows are, the cell padding, what an empty array
// draws and whether empty cells merge — then the page behaviour and the header
// groups, which `TablePageFields` renders. Thin over the pure
// `tableSettingsModel` (read) and `tableSettingsOps` (write); every control is
// ONE edit, i.e. one undo step, and a control the engine would reject the key
// for is absent rather than disabled.

import type { Op } from '@shojiku/designer-core';
import type { EditorController } from '../editor/useEditor';
import { HelpHint } from '../help/HelpHint';
import { useI18n } from '../i18n/context';
import { SECTION_TITLE } from '../ui/chrome';
import { Field } from './fields';
import { hasCapability } from './itemPanelProps';
import { applyPanelOp } from './model';
import { StepperField } from './StepperField';
import { TablePageFields } from './TablePageFields';
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

export function TableSettingsSection({ context }: { readonly context: TableSettingsContext }) {
  const { t } = useI18n();
  const { path, controller, capabilities } = context;
  const view = readTableSettings(controller.read(path));
  const dispatch = (op: Op | null) => applyPanelOp(controller, op);
  return (
    <section className="mb-4">
      <h3 className={SECTION_TITLE}>{t('panel.tableSettings.title')}</h3>
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
        onCommit={(raw) => dispatch(cellPaddingOp(path, view.cellPadding, raw))}
        onStep={(dir) => dispatch(cellPaddingStepOp(path, view.cellPadding, dir))}
      />
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
        <span className="mb-2 flex items-center gap-1.5 text-sm text-text">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={view.mergeEmptyCells}
              onChange={() => dispatch(flagToggleOp(path, 'mergeEmptyCells', view.mergeEmptyCells))}
            />
            {t('panel.tableSettings.mergeEmptyCells')}
          </label>
          <HelpHint
            label={t('help.mergeEmptyCells.title')}
            title={t('help.mergeEmptyCells.title')}
            body={t('help.mergeEmptyCells.body')}
          />
        </span>
      ) : null}
      <TablePageFields context={context} view={view} />
    </section>
  );
}
