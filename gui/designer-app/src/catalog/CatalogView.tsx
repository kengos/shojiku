// The preset catalog: localized cards for the presets the active locale
// surfaces. Presentation only — derivation is `catalogFor` (pure), selection is
// a callback. Document-derived strings (display names) render through React
// escaping; the thumbnail URL was scheme/charset-guarded when the contribution
// was collected (the app's own entries via the asset-path guard, hook
// contributions via the registry's collector), so a card without a safe URL
// simply renders without an image.

import { type PresetContribution, useI18n } from '@shojiku/designer';
import type { CatalogEntry } from './catalog';

export interface CatalogViewProps {
  readonly entries: readonly CatalogEntry[];
  readonly onSelect: (preset: PresetContribution) => void;
}

export function CatalogView({ entries, onSelect }: CatalogViewProps) {
  const { t } = useI18n();
  if (entries.length === 0) {
    return <p className="m-0 p-4 text-muted">{t('catalog.empty')}</p>;
  }
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {entries.map(({ preset, displayName }) => (
        <li key={preset.id}>
          <button
            type="button"
            className="w-full cursor-pointer overflow-hidden rounded-[calc(var(--sj-radius)+3px)] border border-border bg-surface p-0 text-left text-text hover:border-accent hover:shadow-[0_0_0_1px_var(--sj-accent)]"
            onClick={() => onSelect(preset)}
          >
            {preset.thumbnailUrl !== undefined ? (
              <img
                className="block aspect-[3/4] w-full bg-canvas object-contain p-3"
                src={preset.thumbnailUrl}
                alt={displayName}
              />
            ) : null}
            <span className="block px-3 py-2 font-semibold">{displayName}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
