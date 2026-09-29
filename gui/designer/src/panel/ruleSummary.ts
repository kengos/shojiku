// The sentence a row-condition rule reads as — "when <field> is <value>", "when
// <field> is yes", "when <field> is no" — shared by the list row and the rule
// view's heading so the two can never phrase one rule differently. The field is
// named by its definitions LABEL when it has one, else by its key.

import type { PickerOption } from './pickerModel';
import type { RowConditionRow } from './rowConditionsModel';

type T = (key: string, args?: Record<string, string | number>) => string;

export function ruleSummary(t: T, rule: RowConditionRow, picked: PickerOption | undefined): string {
  const field = picked?.label !== undefined && picked.label !== '' ? picked.label : rule.key;
  const named = field === '' ? t('panel.rowConditions.unset') : field;
  if (!rule.hasEquals) {
    return t('panel.rowConditions.whenOn', { field: named });
  }
  if (rule.boolEquals) {
    return rule.equals === 'false'
      ? t('panel.rowConditions.whenOff', { field: named })
      : t('panel.rowConditions.whenOn', { field: named });
  }
  return t('panel.rowConditions.when', {
    field: named,
    value: rule.equals === '' ? t('panel.rowConditions.unset') : rule.equals,
  });
}
