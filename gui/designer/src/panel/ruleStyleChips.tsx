// What a COLLAPSED row-condition rule does, at a glance: one chip per style
// property it sets, so the rule list reads without opening every card.

import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import type { RowConditionRow } from './rowConditionsModel';

/** One chip per style property the rule sets. Colors show as a swatch dot (a
 * hex string means nothing to the nontech-pm). */
export function StyleChips({ rule }: { readonly rule: RowConditionRow }) {
  const { t } = useI18n();
  const chips: ReactNode[] = [];
  if (rule.textAlign !== '') {
    chips.push(<Chip key="align" label={t(`style.value.textAlign.${rule.textAlign}`)} />);
  }
  if (rule.bold) {
    chips.push(<Chip key="bold" label={t('panel.rowConditions.bold')} />);
  }
  for (const [key, value, labelKey] of [
    ['bg', rule.backgroundColor, 'panel.field.backgroundColor'],
    ['fg', rule.color, 'panel.field.color'],
  ] as const) {
    if (value !== '') {
      chips.push(<Chip key={key} label={t(labelKey)} swatch={value} />);
    }
  }
  if (chips.length === 0) {
    return null;
  }
  return <div className="flex flex-wrap gap-1 px-2 pb-1.5">{chips}</div>;
}

/** One applied-style chip. An unknown alignment spelling degrades to its
 * own text (the localized label map is closed). */
function Chip({ label, swatch }: { readonly label: string; readonly swatch?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-px text-muted text-xs">
      {swatch === undefined ? null : (
        <span
          className="size-2.5 rounded-[3px] border border-border"
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
    </span>
  );
}
