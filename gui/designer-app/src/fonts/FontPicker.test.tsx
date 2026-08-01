import { I18nProvider } from '@shojiku/designer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import type { CatalogFamily, FontCatalog } from './catalog';
import { FontPicker, type FontPickerProps } from './FontPicker';

function family(overrides: Partial<CatalogFamily> = {}): CatalogFamily {
  return {
    id: 'lato',
    family: 'Lato',
    category: 'Sans Serif',
    subsets: ['latin'],
    license: 'OFL-1.1',
    licenseFile: 'OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/x/OFL.txt',
    faces: [{ file: 'Lato-Regular.ttf', url: 'https://raw.githubusercontent.com/x/L.ttf' }],
    ...overrides,
  };
}

const CATALOG: FontCatalog = {
  version: 1,
  ref: 'abc',
  families: [
    family(),
    family({ id: 'kanit', family: 'Kanit', subsets: ['latin', 'thai'] }),
    family({ id: 'sawarabi', family: 'Sawarabi Mincho', subsets: ['japanese'] }),
  ],
};

function draw(overrides: Partial<FontPickerProps> = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <I18nProvider locale="en" catalog={APP_CATALOG}>
      <FontPicker
        catalog={CATALOG}
        busy={false}
        installedPackIds={[]}
        onPick={onPick}
        onClose={onClose}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onPick, onClose };
}

describe('FontPicker', () => {
  it('lists the catalog and narrows by search', () => {
    draw();
    expect(screen.getByRole('button', { name: /Lato/ })).toBeDefined();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'kan' } });
    expect(screen.queryByRole('button', { name: /Lato/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Kanit/ })).toBeDefined();
  });

  it('narrows by subset and shows the empty state', () => {
    draw();
    fireEvent.change(screen.getByLabelText('Writing system'), { target: { value: 'japanese' } });
    expect(screen.getByRole('button', { name: /Sawarabi/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Lato/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });
    expect(screen.getByText('No fonts match.')).toBeDefined();
  });

  it('preselects the given subset when the catalog has it', () => {
    draw({ defaultSubset: 'japanese' });
    expect((screen.getByLabelText('Writing system') as HTMLSelectElement).value).toBe('japanese');
    expect(screen.getByRole('button', { name: /Sawarabi/ })).toBeDefined();
  });

  it('falls back to all subsets when the given one is unknown', () => {
    draw({ defaultSubset: 'martian' });
    expect((screen.getByLabelText('Writing system') as HTMLSelectElement).value).toBe('');
  });

  it('picks a selected family', () => {
    const { onPick } = draw();
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    expect(screen.getByText('Licence: OFL-1.1')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add this font' }));
    expect(onPick).toHaveBeenCalledWith(CATALOG.families[0]);
  });

  it('renders the sample in the specimen font once it resolves', async () => {
    draw({ specimen: vi.fn(async () => 'gf-specimen-lato') });
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    await waitFor(() => {
      const sample = screen.getByText(/AaBbCc/);
      expect(sample.style.fontFamily).toBe('gf-specimen-lato');
    });
  });

  it('drops an out-of-order specimen resolution (only the current selection lands)', async () => {
    const resolvers: Array<(font: string) => void> = [];
    const specimen = vi.fn(() => new Promise<string>((resolve) => resolvers.push(resolve)));
    draw({ specimen });
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kanit/ }));
    // The first selection's font arrives late — the stale guard drops it.
    resolvers[0]('gf-stale-lato');
    resolvers[1]('gf-current-kanit');
    await waitFor(() => {
      expect(screen.getByText(/AaBbCc/).style.fontFamily).toBe('gf-current-kanit');
    });
  });

  it('renders the sample unstyled when the host provides no specimen loader', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    expect(screen.getByText(/AaBbCc/).style.fontFamily).toBe('');
  });

  it('survives a rejected specimen (degraded preview, no error state)', async () => {
    draw({ specimen: vi.fn(async () => Promise.reject(new Error('offline'))) });
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    // The sample still renders, unstyled.
    expect(screen.getByText(/AaBbCc/).style.fontFamily).toBe('');
    await Promise.resolve();
  });

  it('disables Add while busy', () => {
    draw({ busy: true });
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    const add = screen.getByRole('button', { name: 'Adding…' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
  });

  it('marks an installed family instead of offering Add', () => {
    draw({ installedPackIds: ['gf-lato'] });
    fireEvent.click(screen.getByRole('button', { name: /Lato/ }));
    expect(screen.getByText('Added to this template.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add this font' })).toBeNull();
  });

  it('closes', () => {
    const { onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});
