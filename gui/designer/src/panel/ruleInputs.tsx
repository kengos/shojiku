// The leaf inputs one row-condition rule's editor composes: the value control
// the picked field earns, and a labeled colour swatch row.

import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { Field } from './fields';
import type { valueFormFor } from './rowConditionsModel';

/** The `equals` state this control renders — the two fields both presence
 * surfaces share. Typed structurally rather than as one surface's row so a
 * table row condition and an item's `visible:` can use the same control
 * instead of keeping two copies of it. */
export interface EqualsState {
  readonly equals: string;
  readonly hasEquals: boolean;
}

/** The value control the picked field earns: its `enum` as a select, nothing
 * at all for a boolean (the wire omits `equals`), else free entry. A stale
 * `equals` on a boolean field (an externally-authored document) stays
 * visible as free entry so it can be seen and cleared. */
export function ValueControl({
  form,
  rule,
  options,
  onChange,
  label,
}: {
  readonly form: ReturnType<typeof valueFormFor>;
  readonly rule: EqualsState;
  readonly options: readonly string[];
  readonly onChange: (value: string | null) => void;
  /** Overrides the row-conditions wording when another surface uses it. */
  readonly label?: string;
}) {
  const { t } = useI18n();
  if (form === 'boolean' && !rule.hasEquals) {
    return null;
  }
  const fieldLabel = label ?? t('panel.rowConditions.value');
  if (form === 'enum') {
    return (
      <Field label={fieldLabel}>
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
    <Field label={fieldLabel}>
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
  hint,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  /** Where a CASCADED value comes from, as the gdoc-style hover bubble. Used
   * where the origin is the engine floor and a badge line would be noise; the
   * bubble is decorative, so the control keeps its own accessible name. */
  readonly hint?: string;
  readonly onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <span className={`${FIELD_LABEL} group/tip relative mb-0 flex-1`}>
        {label}
        {hint === undefined ? null : <TipBubble text={hint} />}
      </span>
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
