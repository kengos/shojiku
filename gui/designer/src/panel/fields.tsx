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
import { TipBubble } from '../ui/TipBubble';

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

/** A field whose control sits BESIDE a button — the pickers' ▼ toggle. The
 * house shape for this (it is `StepperField`'s ▲▼ row): the label is associated
 * by id rather than by wrapping (a `<label>` around the pair would forward
 * clicks to the BUTTON), the outer block owns the bottom margin so no margin
 * lands inside the row, and the row is `items-stretch` — the button takes the
 * input's height instead of being lined up on one of its edges, which is what
 * left the ▼ 8px low and 2px short. `after` renders under the row, inside the
 * same block (the bound-field line). */
export function SideButtonField({
  label,
  htmlFor,
  button,
  after,
  children,
}: {
  readonly label: string;
  readonly htmlFor: string;
  readonly button: ReactNode;
  readonly after?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <span className="mb-2 block">
      <label htmlFor={htmlFor} className={FIELD_LABEL}>
        {label}
      </label>
      <span className="flex min-w-0 items-stretch gap-1">
        <span className="min-w-0 flex-1">{children}</span>
        {button}
      </span>
      {after}
    </span>
  );
}

/** The same label row WITHOUT the `<label>` element, for a field whose content
 * is not one labelable control. A `<label>` forwards every click inside it to
 * its implicit control, and a contenteditable is not labelable — so the text
 * field's label reached PAST the editor to the insert-a-field button beside it,
 * and clicking the text pressed that button instead of placing a caret. The
 * editor names itself with `aria-label`, so the plain block loses nothing. */
export function FieldGroup({ label, children }: FieldProps) {
  return (
    <span className="mb-2 block">
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </span>
  );
}

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
  readonly placeholder?: string;
  /** The unit a BARE value carries (`'pt'`). See `StepperFieldProps.unit`. */
  readonly unit?: string;
  /** What ELSE this field's key accepts, shown as the badge's hover bubble.
   * See `showsUnitHint` — opt-in, because the wire decides. */
  readonly unitHint?: string;
}

export function TextField({ label, value, onCommit, placeholder, unit, unitHint }: TextFieldProps) {
  const id = useId();
  const shown = value === '' ? (placeholder ?? '') : value;
  const badge = badgeText(unit, shown);
  const hint = showsUnitHint(unit, shown, unitHint) ? unitHint : undefined;
  return (
    // Explicit htmlFor/id, not a wrapping label: the badge's text would
    // otherwise fold into the computed label (see StepperField).
    <span className="mb-2 block">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <span className={`relative flex min-w-0${hint === undefined ? '' : ' group/tip'}`}>
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
        {hint === undefined ? null : <TipBubble text={hint} />}
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

/** Whether a unit-bearing field shows its unit HINT — the bubble inviting the
 * reader to type another unit.
 *
 * Three conditions, and each rules out a real field in this panel. The caller
 * must have passed one: `borderWidth` is `number (pt)` in the wire, not a
 * `Length`, so the border pen deliberately passes NONE and a `2mm` there is
 * dropped by its own commit guard. The field must carry a unit at all: a ratio
 * (`lineHeight`) has none. And the shown value must be the BARE numeral whose
 * `pt` is invisible — a value already spelling `12mm` needs no invitation. */
export function showsUnitHint(
  unit: string | undefined,
  shown: string,
  hint: string | undefined,
): boolean {
  return hint !== undefined && unit !== undefined && unitIsImplicit(shown);
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
