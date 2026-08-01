// The sample-variant switcher: a labeled <select> over a SampleSet, rendering
// each variant's localized display name. Shared by the canvas topbar (quick
// switch beside the preview) and the sample-data panel's variant bar. Switching
// is Designer-local sample state — never written into the template.

import { useI18n } from '../i18n/context';
import { SELECT_SM } from '../ui/chrome';
import { type SampleSet, variantDisplayName } from './variants';

export interface VariantSelectProps {
  readonly set: SampleSet;
  readonly onSwitch: (id: string) => void;
}

export function VariantSelect({ set, onSwitch }: VariantSelectProps) {
  const { t, locale } = useI18n();
  return (
    <label className="sj-variant-select flex shrink-0 items-center gap-1 text-sm text-muted">
      {t('canvas.sampleVariant')}
      <select
        className={SELECT_SM}
        value={set.active}
        onChange={(event) => onSwitch(event.currentTarget.value)}
      >
        {set.variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variantDisplayName(variant, locale, t)}
          </option>
        ))}
      </select>
    </label>
  );
}
