// The property panel's CHOICE widgets — a datalist-backed combo, a select, and
// a checkbox group. Split out of `fields.tsx`, which keeps the base widgets
// (`Field` wraps the first two here).
//
// They do NOT share one commit rule. `SelectField` and `CheckboxList` are
// CONTROLLED and commit on change — a discrete pick is already the value.
// `ComboField` still accepts free text, so it stays UNCONTROLLED like
// `TextField`: `defaultValue` + commit-on-blur, keyed by value so it reseeds on
// its own external change and not on a sibling's commit.

import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { Field } from './fields';

export interface ComboFieldProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly listId: string;
  readonly onCommit: (value: string) => void;
}

/** A free-text input backed by a datalist of suggestions — a picker of known
 * names that still accepts a typed value (the format field: registry names as
 * suggestions, free entry allowed; a typo surfaces as a live diagnostic). */
export function ComboField({ label, value, options, listId, onCommit }: ComboFieldProps) {
  return (
    <Field label={label}>
      <input
        key={value}
        type="text"
        className={INPUT}
        defaultValue={value}
        list={listId}
        onBlur={(event) => onCommit(event.currentTarget.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </Field>
  );
}

export interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly noneLabel: string;
  readonly onCommit: (value: string) => void;
  /** Wire spelling → display label for one option (localized enum wording).
   * Absent → the wire spelling is shown as-is. The committed value is always
   * the wire spelling, never the label. */
  readonly optionLabel?: (option: string) => string;
}

export function SelectField({
  label,
  value,
  options,
  noneLabel,
  onCommit,
  optionLabel,
}: SelectFieldProps) {
  return (
    <Field label={label}>
      <select
        className={INPUT}
        value={value}
        onChange={(event) => onCommit(event.currentTarget.value)}
      >
        <option value="">{noneLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel === undefined ? option : optionLabel(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export interface CheckboxListProps {
  readonly label: string;
  readonly options: readonly string[];
  readonly selected: readonly string[];
  readonly emptyLabel: string;
  readonly onToggle: (name: string, on: boolean) => void;
}

// A group of labelled checkboxes as a semantic `<fieldset>`/`<legend>` (its
// group role + accessible name come for free). It does NOT wrap in `Field`
// (whose element is a `<label>`) — each checkbox owns its own `<label>`, and
// nesting labels is invalid HTML that breaks label association.
export function CheckboxList({
  label,
  options,
  selected,
  emptyLabel,
  onToggle,
}: CheckboxListProps) {
  return (
    <fieldset className="mb-2 block border-0 p-0">
      <legend className={FIELD_LABEL}>{label}</legend>
      {options.length === 0 ? (
        <span className="m-0 text-muted">{emptyLabel}</span>
      ) : (
        <span className="flex flex-col gap-0.5">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-accent"
                checked={selected.includes(option)}
                onChange={(event) => onToggle(option, event.currentTarget.checked)}
              />
              {option}
            </label>
          ))}
        </span>
      )}
    </fieldset>
  );
}
