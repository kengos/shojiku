import { I18nProvider, type PresetContribution, type PresetFiles } from '@shojiku/designer';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import { CatalogView } from './CatalogView';
import type { CatalogEntry } from './catalog';

function renderView(ui: ReactElement, locale = 'en-US') {
  return render(
    <I18nProvider locale={locale} catalog={APP_CATALOG}>
      {ui}
    </I18nProvider>,
  );
}

const FILES: PresetFiles = { source: 's', params: '{}', assets: [], variants: [] };

const preset = (id: string, thumbnailUrl?: string): PresetContribution => ({
  id,
  locales: ['en'],
  engineLocale: 'en-US',
  name: { en: id },
  thumbnailUrl,
  load: async () => FILES,
});

const entry = (id: string, displayName: string, thumbnailUrl?: string): CatalogEntry => ({
  preset: preset(id, thumbnailUrl),
  displayName,
});

describe('CatalogView', () => {
  it('renders a localized card with a thumbnail per entry', () => {
    renderView(
      <CatalogView
        entries={[
          entry('receipt-us', 'Receipt', 'https://x/data/presets/receipt-us/preview-1.png'),
        ]}
        onSelect={vi.fn()}
      />,
    );
    const img = screen.getByRole('img', { name: 'Receipt' });
    expect(img.getAttribute('src')).toBe('https://x/data/presets/receipt-us/preview-1.png');
  });

  it('invokes onSelect with the preset when a card is clicked', () => {
    const onSelect = vi.fn();
    const item = entry('receipt-us', 'Receipt', 'https://x/p.png');
    renderView(<CatalogView entries={[item]} onSelect={onSelect} />);
    screen.getByRole('button', { name: /Receipt/ }).click();
    expect(onSelect).toHaveBeenCalledWith(item.preset);
  });

  it('renders the empty state when the locale has no presets', () => {
    renderView(<CatalogView entries={[]} onSelect={vi.fn()} />);
    expect(screen.getByText('No templates for this language yet.')).toBeTruthy();
  });

  it('omits the image when the entry carries no thumbnail URL (a guarded-out one)', () => {
    renderView(<CatalogView entries={[entry('receipt-us', 'Receipt')]} onSelect={vi.fn()} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Receipt')).toBeTruthy();
  });
});
