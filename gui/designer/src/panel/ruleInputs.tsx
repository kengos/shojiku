// The leaf inputs one row-condition rule's editor composes: the value control
// the picked field earns, and a labeled colour swatch row.

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { ColorSwatchPicker } from '../ui/ColorSwatchPicker';
import { FIELD_LABEL, INPUT, PANEL_SWATCH_TRIGGER } from '../ui/chrome';
import { TipBubble } from '../ui/TipBubble';
import { Field } from './fields';
import type { valueFormFor } from './rowConditionsModel';
import { useReseedKey } from './useReseedKey';

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
  // Both arms wear the house `INPUT`. Without it they render as RAW browser
  // widgets — which in dark chrome is a white box, the brightest object on the
  // panel, for the one field on the surface that is asking for a value.
  if (form === 'enum') {
    return (
      <Field label={fieldLabel}>
        <select
          className={INPUT}
          value={rule.equals}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
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
  return <EqualsInput fieldLabel={fieldLabel} rule={rule} onChange={onChange} />;
}

/** The free-text `equals` entry. Its own component so the reseed hook sits
 * above the early returns the picker arms take.
 *
 * The nonce is needed because the commit NORMALISES rather than refusing:
 * `setVisibleEqualsOp` always authors, but `literal()` runs a numeric field's
 * entry through `Number(value.trim())`, so ` 40.0 ` over an `equals: 40` rule
 * writes 40 and the value in the key never moves. */
function EqualsInput({
  fieldLabel,
  rule,
  onChange,
}: {
  readonly fieldLabel: string;
  readonly rule: EqualsState;
  readonly onChange: (value: string | null) => void;
}) {
  const [inputKey, reseed] = useReseedKey(rule.equals);
  return (
    <Field label={fieldLabel}>
      <input
        key={inputKey}
        className={INPUT}
        type="text"
        defaultValue={rule.equals}
        onBlur={(event) => {
          if (event.currentTarget.value !== rule.equals) {
            onChange(event.currentTarget.value);
            reseed();
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
   * where the origin is the engine floor and a badge line would be noise. The
   * control keeps its own accessible name and DESCRIBES itself with the
   * bubble, so the origin reaches a keyboard user without being re-read on
   * every visit. */
  readonly hint?: string;
  readonly onCommit: (value: string) => void;
}) {
  const { t } = useI18n();
  const hintId = useId();
  // The hover group is the whole ROW, not the label: the origin explains the
  // CONTROL, so pointing at the swatch has to be enough to see it. The bubble
  // still hangs off the label span (the only `relative` box here), which is
  // where it has always been drawn.
  return (
    <div className="group/tip flex items-center gap-2">
      <span className={`${FIELD_LABEL} relative mb-0 flex-1`}>
        {label}
        {hint === undefined ? null : <TipBubble text={hint} id={hintId} align="start" />}
      </span>
      <ColorSwatchPicker
        label={label}
        describedBy={hint === undefined ? undefined : hintId}
        value={value}
        onCommit={onCommit}
        triggerClassName={PANEL_SWATCH_TRIGGER}
        customLabel={t('toolbar.color.custom')}
        clearLabel={t('toolbar.color.clear')}
      />
    </div>
  );
}
