// The leaf inputs one row-condition rule's editor composes: the value control
// the picked field earns, and a labeled colour swatch row.

import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { Field } from './fields';
import type { RowConditionRow, valueFormFor } from './rowConditionsModel';

/** The value control the picked field earns: its `enum` as a select, nothing
 * at all for a boolean (the wire omits `equals`), else free entry. A stale
 * `equals` on a boolean field (an externally-authored document) stays
 * visible as free entry so it can be seen and cleared. */
export function ValueControl({
  form,
  rule,
  options,
  onChange,
}: {
  readonly form: ReturnType<typeof valueFormFor>;
  readonly rule: RowConditionRow;
  readonly options: readonly string[];
  readonly onChange: (value: string | null) => void;
}) {
  const { t } = useI18n();
  if (form === 'boolean' && !rule.hasEquals) {
    return null;
  }
  const label = t('panel.rowConditions.value');
  if (form === 'enum') {
    return (
      <Field label={label}>
        <select value={rule.equals} onChange={(event) => onChange(event.currentTarget.value)}>
          <option value="">{t('panel.rowConditions.unset')}</option>
          {options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <input
        key={rule.equals}
        type="text"
        defaultValue={rule.equals}
        onBlur={(event) => {
          if (event.currentTarget.value !== rule.equals) {
            onChange(event.currentTarget.value);
          }
        }}
      />
    </Field>
  );
}

export function SwatchRow({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <span className={`${FIELD_LABEL} mb-0 flex-1`}>{label}</span>
      <ColorSwatchPicker
        label={label}
        value={value}
        onCommit={onCommit}
        triggerClassName={PANEL_SWATCH_TRIGGER}
        customLabel={t('toolbar.color.custom')}
        clearLabel={t('toolbar.color.clear')}
      />
    </div>
  );
}
