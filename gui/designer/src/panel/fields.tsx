// The property panel's base field widgets — the label wrapper, the plain
// commit-on-blur text input, and the in-input unit badge the sibling widget
// modules share. The stepper/seeded/choice widgets live beside this file
// (`StepperField.tsx`, `SeededField.tsx`, `choiceFields.tsx`) and take their
// badge helpers from here.
//
// Free-text/number inputs are UNCONTROLLED (commit on blur) so a keystroke does
// not re-serialize the whole document per character. Each input is KEYED BY ITS
// OWN committed value, so it reseeds (React remounts it) exactly when THAT value
// changes — an undo, a selection switch, a canvas drag — and NOT when a sibling
// field commits: the old blunt `key={revision}` remounted the whole section on
// every edit, which discarded an in-progress sibling input (the value would be
// lost one field in two during rapid entry). A lone input is the only child of
// its `<label>`, so keying it by value never collides with a sibling. The
// DISCRETE inputs (select, checkbox) are controlled and re-render from the
// model instead — they live in `choiceFields.tsx`. Every value renders as React
// text (auto-escaped); the panel never builds HTML from document strings. Chrome is Tailwind utilities over the --sj-* tokens (the
// shared INPUT/FIELD_LABEL strings from ui/chrome).

import { type ReactNode, useId } from 'react';
import { FIELD_LABEL, INPUT } from '../ui/chrome';

export interface FieldProps {
  readonly label: string;
  readonly children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is always passed in as `children` (a single input/select), which the label wraps implicitly.
    <label className="mb-2 block">
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </label>
  );
}

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly placeholder?: string;
  /** The unit a BARE value carries (`'pt'`). See `StepperFieldProps.unit`. */
  readonly unit?: string;
}

export function TextField({ label, value, onCommit, placeholder, unit }: TextFieldProps) {
  const id = useId();
  const badge = badgeText(unit, value === '' ? (placeholder ?? '') : value);
  return (
    // Explicit htmlFor/id, not a wrapping label: the badge's text would
    // otherwise fold into the computed label (see StepperField).
    <span className="mb-2 block">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <span className="relative flex min-w-0">
        <input
          key={value}
          id={id}
          type="text"
          className={`${INPUT} w-full min-w-0 ${badge === undefined ? '' : 'pr-9'}`}
          defaultValue={value}
          placeholder={placeholder}
          onBlur={(event) => onCommit(event.currentTarget.value)}
        />
        {badge === undefined ? null : <UnitBadge text={badge} />}
      </span>
    </span>
  );
}

/** The small suffix badge inside a unit-bearing input. `aria-hidden`: it is a
 * reading aid for a value the field already contains, and it must not join the
 * control's accessible name. */
export function UnitBadge({ text }: { readonly text: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded border border-border px-1 text-[10px] leading-tight text-muted"
    >
      {text}
    </span>
  );
}

// A value whose unit is INVISIBLE: a bare numeral, which the engine reads as
// points. A value that spells its own unit (`12mm`, `50%`) already says so on
// screen and must not be labelled `pt` — it is not one.
const BARE_NUMERAL = /^\s*-?\d+(?:\.\d+)?\s*$/;

/** Whether a field's shown text is a bare numeral, i.e. a length whose `pt`
 * unit is implicit. Exported for the raw-input call sites that cannot use the
 * shared widgets. */
export function unitIsImplicit(shown: string): boolean {
  return BARE_NUMERAL.test(shown);
}

/** The badge text for a unit-bearing field: the implicit unit, the caller's own
 * tag, or both. `undefined` when there is nothing to show. Shared with the
 * stepper/seeded widgets beside this file, which render the same badge. */
export function badgeText(
  unit: string | undefined,
  shown: string,
  tag?: string,
): string | undefined {
  const implicit = unit !== undefined && unitIsImplicit(shown) ? unit : undefined;
  if (implicit === undefined) {
    return tag;
  }
  return tag === undefined ? implicit : `${implicit} · ${tag}`;
}
