import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { Catalog } from './catalog';
import { I18nProvider, useI18n } from './context';

const wrap =
  (locale: string, catalog?: Catalog) =>
  ({ children }: { children: ReactNode }) => (
    <I18nProvider locale={locale} catalog={catalog}>
      {children}
    </I18nProvider>
  );

describe('useI18n', () => {
  it('throws outside a provider', () => {
    expect(() => renderHook(() => useI18n())).toThrow(/I18nProvider/);
  });

  it('resolves a BCP 47 tag to chrome + diagnostics in that language', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: wrap('ja-JP') });
    expect(result.current.locale).toBe('ja-JP');
    expect(result.current.language).toBe('ja');
    expect(result.current.t('app.save')).toBe('保存');
    const text = result.current.describe({
      severity: 'warning',
      code: 'rect_missing_size',
      category: 'layout',
      message: 'rect items need box.w and box.h',
      args: {},
    });
    expect(text).toContain('スキップ');
  });

  it('renders a script-aliased tag through its Chinese catalog', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: wrap('zh-Hant-TW') });
    expect(result.current.language).toBe('zh-tw');
    expect(result.current.t('app.save')).toBe('儲存');
  });

  it('degrades an unsupported tag to English', () => {
    const { result } = renderHook(() => useI18n(), { wrapper: wrap('de-DE') });
    expect(result.current.language).toBe('en');
    expect(result.current.t('app.save')).toBe('Save');
  });

  it('uses an injected catalog override', () => {
    const catalog: Catalog = { en: { diagnostics: {}, chrome: { 'app.save': 'Store' } } };
    const { result } = renderHook(() => useI18n(), { wrapper: wrap('en-US', catalog) });
    expect(result.current.t('app.save')).toBe('Store');
  });

  it('falls back to en as the primary language when no chain language is in the catalog', () => {
    const catalog: Catalog = { xx: { diagnostics: {}, chrome: {} } };
    const { result } = renderHook(() => useI18n(), { wrapper: wrap('fr-FR', catalog) });
    expect(result.current.language).toBe('en');
  });
});
