// One row-condition rule as the LIST shows it — Google Sheets' conditional-format
// sidebar row: the rule's sentence ("when <field> is <value>"), the chips of what
// it adds, and a remove button. Pressing the row opens the rule's own view
// (`RuleControls`) in place of the list.

import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { IconTrash } from '../ui/icons';
import type { PickerOption } from './pickerModel';
import type { RowConditionRow } from './rowConditionsModel';
import { StyleChips } from './ruleStyleChips';
import { ruleSummary } from './ruleSummary';

export interface RuleCardProps {
  readonly rule: RowConditionRow;
  readonly index: number;
  readonly picked: PickerOption | undefined;
  readonly onOpen: () => void;
  readonly onRemove: () => void;
}

export function RuleCard({ rule, index, picked, onOpen, onRemove }: RuleCardProps) {
  const { t } = useI18n();
  return (
    <li className="rounded-md border border-border bg-surface">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-sm text-text"
          onClick={onOpen}
        >
          {ruleSummary(t, rule, picked)}
        </button>
        <IconButton
          label={t('panel.rowConditions.remove')}
          className="min-h-7 min-w-7 p-1"
          onClick={onRemove}
        >
          <IconTrash size={14} />
        </IconButton>
      </div>
      <StyleChips rule={rule} />
      <span className="sr-only">{`${index + 1}`}</span>
    </li>
  );
}
