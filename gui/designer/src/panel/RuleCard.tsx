// One row-condition rule as the list shows it: a summary line legible without
// opening the card ("when <field> is <value>"), the applied-style chips
// while collapsed, and the editor body while open.

import { useI18n } from '../i18n/context';
import { IconButton } from '../ui/Button';
import { IconChevronDown, IconTrash } from '../ui/icons';
import type { PickerOption } from './pickerModel';
import { RuleControls } from './RuleControls';
import type { RowConditionRow } from './rowConditionsModel';
import { StyleChips } from './ruleStyleChips';

export interface RuleCardProps {
  readonly rule: RowConditionRow;
  readonly index: number;
  readonly open: boolean;
  readonly options: readonly PickerOption[];
  readonly onToggle: () => void;
  readonly onRemove: () => void;
  readonly onKeyChange: (key: string) => void;
  readonly onEqualsChange: (value: string | null, fieldType: string) => void;
  readonly onStyleChange: (property: string, value: string | null) => void;
}

/** One rule: the summary line plus, when open, its controls. */
export function RuleCard({
  rule,
  index,
  open,
  options,
  onToggle,
  onRemove,
  onKeyChange,
  onEqualsChange,
  onStyleChange,
}: RuleCardProps) {
  const { t } = useI18n();
  const picked = options.find((o) => o.key === rule.key);
  return (
    <li className="rounded-md border border-border bg-surface">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-sm text-text"
          aria-expanded={open}
          onClick={onToggle}
        >
          {summary(t, rule, picked)}
        </button>
        <IconButton
          label={t('panel.rowConditions.remove')}
          className="min-h-7 min-w-7 p-1"
          onClick={onRemove}
        >
          <IconTrash size={14} />
        </IconButton>
        <IconButton
          label={open ? t('panel.rowConditions.collapse') : t('panel.rowConditions.expand')}
          className="min-h-7 min-w-7 p-1"
          onClick={onToggle}
        >
          <IconChevronDown size={14} className={open ? 'rotate-180' : undefined} />
        </IconButton>
      </div>
      {open ? null : <StyleChips rule={rule} />}
      {open ? (
        <RuleControls
          rule={rule}
          options={options}
          picked={picked}
          onKeyChange={onKeyChange}
          onEqualsChange={onEqualsChange}
          onStyleChange={onStyleChange}
        />
      ) : null}
      <span className="sr-only">{`${index + 1}`}</span>
    </li>
  );
}

/** "When <field> is <value>" — the field's LABEL when definitions name
 * it, else its key; a boolean rule reads "when <field> is on" instead. */
function summary(
  t: (key: string, args?: Record<string, string | number>) => string,
  rule: RowConditionRow,
  picked: PickerOption | undefined,
): string {
  const field = picked?.label !== undefined && picked.label !== '' ? picked.label : rule.key;
  const named = field === '' ? t('panel.rowConditions.unset') : field;
  if (!rule.hasEquals) {
    return t('panel.rowConditions.whenOn', { field: named });
  }
  return t('panel.rowConditions.when', {
    field: named,
    value: rule.equals === '' ? t('panel.rowConditions.unset') : rule.equals,
  });
}
