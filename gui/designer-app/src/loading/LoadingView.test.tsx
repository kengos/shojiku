import { I18nProvider } from '@shojiku/designer';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import { LoadingView } from './LoadingView';
import type { LoadPhase } from './phase';

function renderView(phase: LoadPhase, locale = 'en-US'): void {
  render(
    <I18nProvider locale={locale} catalog={APP_CATALOG}>
      <LoadingView name="Receipt" phase={phase} />
    </I18nProvider>,
  );
}

/** Each stage row's full text, in render order (label plus any byte counts). */
function rowTexts(): string[] {
  return screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
}

/** Which stage rows draw an icon — the done (check) and failed (warning) marks.
 * The active and pending marks are rings, so they carry no glyph. */
function rowsWithIcon(): boolean[] {
  return screen.getAllByRole('listitem').map((li) => li.querySelector('svg') !== null);
}

describe('LoadingView', () => {
  it('names the opening document and the three stages', () => {
    renderView({ kind: 'engine', bytes: { loaded: 0, total: 100 } });
    expect(screen.getByRole('heading', { name: 'Receipt' })).toBeTruthy();
    expect(screen.getByText('Preparing this template')).toBeTruthy();
    expect(rowTexts()).toEqual([
      'Preparing engine0 KB / 0 KB',
      'Loading fonts',
      'Preparing preview',
    ]);
    expect(rowsWithIcon()).toEqual([false, false, false]);
  });

  it('marks finished stages done and shows byte counts on the transferring one', () => {
    renderView({ kind: 'fonts', bytes: { loaded: 11_500_000, total: 18_600_000 } });
    expect(rowTexts()).toEqual([
      'Preparing engine',
      'Loading fonts11.5 MB / 18.6 MB',
      'Preparing preview',
    ]);
    expect(rowsWithIcon()).toEqual([true, false, false]);
  });

  it('shows the percentage under the bar when the size is known', () => {
    renderView({ kind: 'fonts', bytes: { loaded: 11_500_000, total: 18_600_000 } });
    expect(screen.getByText('62%')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Loading fonts' });
    expect(bar.getAttribute('aria-valuenow')).toBe('62');
  });

  // The degraded state: no usable Content-Length means no percentage and no byte
  // counts anywhere — an indeterminate bar and the stage names alone.
  it('degrades to an indeterminate bar with no numbers at all', () => {
    renderView({ kind: 'fonts', bytes: { loaded: 4096 } });
    const bar = screen.getByRole('progressbar', { name: 'Loading fonts' });
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(screen.queryByText(/%$/)).toBeNull();
    expect(rowTexts()).toEqual(['Preparing engine', 'Loading fonts', 'Preparing preview']);
  });

  it('marks both transfers done in the render phase', () => {
    renderView({ kind: 'render' });
    expect(rowsWithIcon()).toEqual([true, true, false]);
    expect(screen.getByRole('progressbar', { name: 'Preparing preview' })).toBeTruthy();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  // A failed module cannot be waited out: the bar goes away entirely and the
  // remedy is stated, rather than leaving a rail frozen part-way.
  it('replaces the bar with the failure and its remedy', () => {
    renderView({ kind: 'failed', stage: 'engine' });
    expect(
      screen.getByText('This template could not be prepared. Reload the page to try again.'),
    ).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(rowsWithIcon()).toEqual([true, false, false]);
  });

  it('renders the stage names in the active UI locale', () => {
    renderView({ kind: 'fonts', bytes: { loaded: 1, total: 2 } }, 'ja');
    expect(rowTexts()).toEqual([
      'エンジンを準備',
      'フォントを読み込み0 KB / 0 KB',
      'プレビューを準備',
    ]);
    expect(screen.getByText('テンプレートを準備しています')).toBeTruthy();
  });
});
