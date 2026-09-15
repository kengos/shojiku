// The iterable dialog's presentation picker: table / cards / grid / list. Every
// variant row stays VISIBLE and disabled when it cannot be offered — a
// field-less group renders only as a list, and a body that is not a flow cannot
// hold the cards or the grid — because a control that appears and disappears
// reads as a bug. The second reason is not visible in the row itself, so it
// gets one sentence under the rows; the first is (a field-less source has no
// fields to lay out).

import { useId } from 'react';
import { useI18n } from '../i18n/context';
import { SCAFFOLD_VARIANTS, type ScaffoldVariant } from './scaffold';

/** Catalog keys per variant — indexed only by the closed union, never by a
 * document string. */
const VARIANT_LABEL_KEYS: Record<ScaffoldVariant, string> = {
  table: 'iterable.variant.table',
  repeat_flow: 'iterable.variant.cards',
  repeat: 'iterable.variant.grid',
  list: 'iterable.variant.list',
};

interface IterableVariantPickerProps {
  /** Which variants can be picked; the rest render disabled. */
  readonly available: readonly ScaffoldVariant[];
  readonly selected: ScaffoldVariant;
  readonly onPick: (variant: ScaffoldVariant) => void;
  /** Whether the document's body is a flow. When it is not, the flow-only
   * variants are among the disabled rows and the note says why. */
  readonly flowBody: boolean;
}

export function IterableVariantPicker({
  available,
  selected,
  onPick,
  flowBody,
}: IterableVariantPickerProps) {
  const { t } = useI18n();
  const noteId = useId();
  return (
    <fieldset
      className="m-0 rounded-md border border-border p-2"
      aria-describedby={flowBody ? undefined : noteId}
    >
      <legend className="px-1 text-sm text-muted">{t('iterable.variant')}</legend>
      <div className="flex flex-wrap gap-3">
        {SCAFFOLD_VARIANTS.map((option) => (
          <label key={option} className="flex items-center gap-1">
            <input
              type="radio"
              name="sj-iterable-variant"
              checked={option === selected}
              disabled={!available.includes(option)}
              // On each radio as well as the group: the radio is what has focus,
              // and a group-only description is announced far less reliably
              // (the `ui/Segmented` rule).
              aria-describedby={flowBody ? undefined : noteId}
              onChange={() => onPick(option)}
            />
            {t(VARIANT_LABEL_KEYS[option])}
          </label>
        ))}
      </div>
      {flowBody ? null : (
        <p id={noteId} className="m-0 mt-1.5 text-[11px] leading-relaxed text-muted">
          {t('iterable.variant.flowOnly')}
        </p>
      )}
    </fieldset>
  );
}
