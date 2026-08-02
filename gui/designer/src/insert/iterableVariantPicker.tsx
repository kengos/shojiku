// The iterable dialog's presentation picker: table / cards / list. Every
// variant row stays VISIBLE and disabled when the picked source cannot offer it
// (a field-less group renders only as a list) — a control that appears and
// disappears reads as a bug.

import { useI18n } from '../i18n/context';
import type { ScaffoldVariant } from './scaffold';

/** Catalog keys per variant — indexed only by the closed union, never by a
 * document string. */
const VARIANT_LABEL_KEYS: Record<ScaffoldVariant, string> = {
  table: 'iterable.variant.table',
  repeat_flow: 'iterable.variant.cards',
  list: 'iterable.variant.list',
};

const ALL_VARIANTS: readonly ScaffoldVariant[] = ['table', 'repeat_flow', 'list'];

interface IterableVariantPickerProps {
  /** Which variants the picked source supports; the rest render disabled. */
  readonly available: readonly ScaffoldVariant[];
  readonly selected: ScaffoldVariant;
  readonly onPick: (variant: ScaffoldVariant) => void;
}

export function IterableVariantPicker({ available, selected, onPick }: IterableVariantPickerProps) {
  const { t } = useI18n();
  return (
    <fieldset className="m-0 flex flex-wrap gap-3 rounded-md border border-border p-2">
      <legend className="px-1 text-sm text-muted">{t('iterable.variant')}</legend>
      {ALL_VARIANTS.map((option) => (
        <label key={option} className="flex items-center gap-1">
          <input
            type="radio"
            name="sj-iterable-variant"
            checked={option === selected}
            disabled={!available.includes(option)}
            onChange={() => onPick(option)}
          />
          {t(VARIANT_LABEL_KEYS[option])}
        </label>
      ))}
    </fieldset>
  );
}
