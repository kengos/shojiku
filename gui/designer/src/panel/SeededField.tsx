// The document-settings surfaces' seeded style field: an input whose UNSET
// state shows the engine fallback as a placeholder rather than as a value.
// Split out of `fields.tsx`, which keeps the base widgets plus the badge
// helpers this file renders through.

import { useId } from 'react';
import { FIELD_LABEL, INPUT } from '../ui/chrome';
import { badgeText, UnitBadge } from './fields';

export interface SeededFieldProps {
  readonly label: string;
  /** The authored wire value (`''` = unset — the field then shows EMPTY, with
   * `seed` as its placeholder). */
  readonly authored: string;
  /** The engine fallback this key renders at while unset, shown as the field's
   * PLACEHOLDER. Absent → `placeholder` is used instead (a host-derived default
   * the host did not supply). */
  readonly seed?: string;
  /** Placeholder when the field has neither an authored value nor a seed. */
  readonly placeholder?: string;
  /** Datalist suggestions (the fontFamily combo); omit for a plain text field. */
  readonly options?: readonly string[];
  readonly listId?: string;
  /** The unit a BARE value carries (`'pt'`). See `StepperFieldProps.unit`. */
  readonly unit?: string;
  readonly onCommit: (value: string) => void;
}

/** A defaults-surface style field whose UNSET state reads as unset: the box is
 * EMPTY and the engine fallback sits in the placeholder, so nothing on screen
 * claims the document authored a value it did not ("seed the display, author only what
 * changed" — an earlier form filled the box with the fallback under a default tag,
 * which read as a setting the user had made). An empty field commits nothing, so
 * touching the surface never authors a redundant `defaults.style` key. Mirrors
 * `StepperField`'s changed-guard + explicit htmlFor/id, minus the ▲▼ steppers. */
export function SeededField({
  label,
  authored,
  seed,
  placeholder,
  options,
  listId,
  unit,
  onCommit,
}: SeededFieldProps) {
  const id = useId();
  const hint = seed !== undefined && seed !== '' ? seed : placeholder;
  // An unset field shows the fallback as its placeholder, so the unit belongs
  // to that text — 「10」 is as unreadable in a placeholder as in a value.
  const badge = badgeText(unit, authored === '' ? (hint ?? '') : authored);
  return (
    <span className="mb-2 block">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <span className="relative flex min-w-0">
        <input
          key={authored}
          id={id}
          type="text"
          className={`${INPUT} w-full min-w-0 ${badge === undefined ? '' : 'pr-9'}`}
          defaultValue={authored}
          placeholder={hint}
          list={listId}
          onBlur={(event) => {
            const next = event.currentTarget.value;
            // Unchanged, or an unset field left empty → write nothing (only
            // touched keys change). Clearing an AUTHORED field is a real edit:
            // it hands the key back to the engine default, so it commits.
            if (next === authored) {
              return;
            }
            onCommit(next);
          }}
        />
        {badge === undefined ? null : <UnitBadge text={badge} />}
        {options !== undefined && listId !== undefined ? (
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        ) : null}
      </span>
    </span>
  );
}
