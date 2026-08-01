import { I18nProvider } from '@shojiku/designer';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import { EngineLoadBar, EngineLoadStatus } from './EngineLoadBar';
import type { ModuleLoad } from './moduleLoad';
import type { ByteProgress } from './progress';

function renderChrome(ui: ReactNode, locale = 'en-US'): void {
  render(
    <I18nProvider locale={locale} catalog={APP_CATALOG}>
      {ui}
    </I18nProvider>,
  );
}

const loading = (bytes: ByteProgress): ModuleLoad => ({ kind: 'loading', bytes });

describe('EngineLoadBar', () => {
  it('shows the rail with the module progress while it arrives', () => {
    renderChrome(<EngineLoadBar load={loading({ loaded: 834_121, total: 1_668_242 })} />);
    const bar = screen.getByRole('progressbar', { name: 'Preparing engine' });
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.className).toContain('h-[3px]');
  });

  it('runs indeterminate when the server declared no size', () => {
    renderChrome(<EngineLoadBar load={loading({ loaded: 1024 })} />);
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });

  // Catalog-first means this chrome sits over a usable page: once the module is
  // in (or has failed) it must leave no trace, never a rail frozen part-way.
  it('disappears once the module is ready', () => {
    renderChrome(<EngineLoadBar load={{ kind: 'ready' }} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('disappears when the module failed', () => {
    renderChrome(<EngineLoadBar load={{ kind: 'failed' }} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('EngineLoadStatus', () => {
  it('names the wait and its percentage', () => {
    renderChrome(<EngineLoadStatus load={loading({ loaded: 834_121, total: 1_668_242 })} />);
    expect(screen.getByRole('status').textContent).toBe('Preparing engine 50%');
  });

  it('names the wait without a percentage when the size is unknown', () => {
    renderChrome(<EngineLoadStatus load={loading({ loaded: 1024 })} />);
    expect(screen.getByRole('status').textContent).toBe('Preparing engine');
  });

  it('reports the failure in the header, in short form', () => {
    renderChrome(<EngineLoadStatus load={{ kind: 'failed' }} />);
    expect(screen.getByRole('status').textContent).toBe('Engine unavailable');
  });

  it('says nothing once the module is ready', () => {
    renderChrome(<EngineLoadStatus load={{ kind: 'ready' }} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('reports in the active UI locale', () => {
    renderChrome(<EngineLoadStatus load={loading({ loaded: 1, total: 4 })} />, 'ja');
    expect(screen.getByRole('status').textContent).toBe('エンジンを準備 25%');
  });
});
