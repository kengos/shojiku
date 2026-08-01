import { DEFAULT_CATALOG } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from './appCatalog';

describe('APP_CATALOG', () => {
  it('adds app shell chrome to en (the terminal fallback)', () => {
    expect(APP_CATALOG.en.chrome['catalog.title']).toBe('Choose a template');
    expect(APP_CATALOG.en.chrome['app.export']).toBe('Export');
  });

  it('adds localized app chrome to ja', () => {
    expect(APP_CATALOG.ja.chrome['catalog.title']).toBe('テンプレートを選ぶ');
  });

  it('preserves the designer chrome + diagnostics it extends', () => {
    expect(APP_CATALOG.en.chrome['app.save']).toBe(DEFAULT_CATALOG.en.chrome['app.save']);
    expect(APP_CATALOG.en.diagnostics).toBe(DEFAULT_CATALOG.en.diagnostics);
    expect(APP_CATALOG.ja.chrome['panel.title']).toBe(DEFAULT_CATALOG.ja.chrome['panel.title']);
  });

  it('leaves other languages as the designer catalog provides them', () => {
    expect(APP_CATALOG['zh-tw']).toBe(DEFAULT_CATALOG['zh-tw']);
    expect(APP_CATALOG.fil).toBe(DEFAULT_CATALOG.fil);
  });
});
