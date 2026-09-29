// The value control a presence predicate's picked field earns — shared by the
// three surfaces that author one (a table row-condition rule, an item's
// `visible:`, a form mark's `data:`), so they cannot disagree about which field
// type gets which control:
//
//   - a BOOLEAN field → a yes/no pair. Yes is the wire's boolean form (no
//     `equals`); no authors `equals: false`, which the engine matches against a
//     false value only (a missing key matches neither).
//   - an ENUM field → its declared values as chips after a "not set" chip (a
//     select with the same unset row when there are too many to show as chips);
//     a value outside the declared set is shown verbatim.
//   - anything else → free entry, with the values the sample data actually
//     carries offered as chips underneath, so the common case is a pick.
//
// A stale `equals` a boolean field cannot hold (a quoted `"false"`, a number —
// an externally-authored document) keeps the free-entry arm, so it can be seen
// and cleared rather than hidden behind a yes/no that would misstate it.

import { useI18n } from '../i18n/context';
import { INPUT } from '../ui/chrome';
import { Segmented } from '../ui/Segmented';
import { Field } from './fields';
import type { valueFormFor } from './rowConditionsModel';
import { MAX_VALUE_CHIPS } from './ruleValues';
import { useReseedKey } from './useReseedKey';
import { ValueChips } from './ValueChips';

/** The `equals` state this control renders — the fields all three presence
 * surfaces share. Typed structurally rather than as one surface's row so the
 * three can use the same control instead of keeping copies of it. */
export interface EqualsState {
  readonly equals: string;
  readonly hasEquals: boolean;
  /** Whether `equals` is authored as a boolean literal (see the read models). */
  readonly boolEquals: boolean;
}

export interface ValueControlProps {
  readonly form: ReturnType<typeof valueFormFor>;
  readonly rule: EqualsState;
  /** The field's declared enum values (the enum arm's chips). */
  readonly options: readonly string[];
  /** Values the sample data carries for the field (the free-entry arm's
   * chips). Omit where no sample applies. */
  readonly samples?: readonly string[];
  /** `null` clears `equals`; a string is the entry, typed by the caller's
   * literal rule (`equalsLiteral`). */
  readonly onChange: (value: string | null) => void;
  /** Overrides the row-conditions wording when another surface uses it. */
  readonly label?: string;
}

export function ValueControl({
  form,
  rule,
  options,
  samples = [],
  onChange,
  label,
}: ValueControlProps) {
  const { t } = useI18n();
  const fieldLabel = label ?? t('panel.rowConditions.value');
  if (form === 'boolean' && (!rule.hasEquals || rule.boolEquals)) {
    const off = rule.boolEquals && rule.equals === 'false';
    return (
      <Segmented
        ariaLabel={fieldLabel}
        value={off ? 'off' : 'on'}
        options={[
          { value: 'on', label: t('panel.value.on') },
          { value: 'off', label: t('panel.value.off') },
        ]}
        onChange={(value) => onChange(value === 'off' ? 'false' : null)}
      />
    );
  }
  if (form === 'enum') {
    // A value the wire carries OUTSIDE the declared set (an external template,
    // a definitions file that dropped it) stays on screen verbatim, so it can
    // be seen and replaced or cleared rather than surviving invisibly.
    const values =
      rule.hasEquals && rule.equals !== '' && !options.includes(rule.equals)
        ? [...options, rule.equals]
        : options;
    return values.length <= MAX_VALUE_CHIPS ? (
      <ValueChips
        label={fieldLabel}
        values={values}
        current={rule.equals}
        unset={{ label: t('panel.rowConditions.unset'), active: !rule.hasEquals }}
        onPick={onChange}
      />
    ) : (
      <EnumSelect label={fieldLabel} rule={rule} options={values} onChange={onChange} />
    );
  }
  return (
    <>
      <EqualsInput fieldLabel={fieldLabel} rule={rule} onChange={onChange} />
      {samples.length > 0 ? (
        <ValueChips
          label={t('panel.value.samples')}
          values={samples}
          current={rule.equals}
          onPick={onChange}
        />
      ) : null}
    </>
  );
}

/** The enum arm past the chip cap: a select with an explicit unset row. */
function EnumSelect({
  label,
  rule,
  options,
  onChange,
}: {
  readonly label: string;
  readonly rule: EqualsState;
  readonly options: readonly string[];
  readonly onChange: (value: string | null) => void;
}) {
  const { t } = useI18n();
  // The house `INPUT`: without it a raw browser select renders as a white box
  // in dark chrome, the brightest object on the panel.
  return (
    <Field label={label}>
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

/** The free-text `equals` entry. Its own component so the reseed hook sits
 * above the early returns the arms take.
 *
 * The nonce is needed because the commit NORMALISES rather than refusing:
 * `equalsLiteral` runs a numeric field's entry through `Number(value.trim())`,
 * so ` 40.0 ` over an `equals: 40` rule writes 40 and the value in the key
 * never moves. */
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
