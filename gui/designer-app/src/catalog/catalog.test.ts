import type { PresetContribution, PresetFiles } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { catalogFor, wantsDefinitions } from './catalog';

const FILES: PresetFiles = { source: 's', params: '{}', assets: [], variants: [] };

const contribution = (
  id: string,
  locales: readonly string[],
  name: Readonly<Record<string, string>>,
): PresetContribution => ({
  id,
  locales,
  engineLocale: locales[0] === 'ja' ? 'ja-JP' : 'en-US',
  name,
  load: async () => FILES,
});

// The merged boot-collected list: bundled entries and an integrator
// contribution ride the same shape and the same per-locale filtering.
const presets: readonly PresetContribution[] = [
  contribution('genkoyoshi-ja', ['ja'], { ja: '原稿用紙', en: 'Manuscript' }),
  contribution('receipt-us', ['en'], { en: 'Receipt' }),
  contribution('only-en-name', ['ja'], { en: 'Fallback' }),
  contribution('nameless', ['ja'], {}),
];

describe('catalogFor', () => {
  it('surfaces only the locale’s own presets (ja excludes en)', () => {
    const ids = catalogFor(presets, 'ja-JP').map((e) => e.preset.id);
    expect(ids).toEqual(['genkoyoshi-ja', 'only-en-name', 'nameless']);
  });

  it('an English locale sees its en presets but not ja ones', () => {
    const ids = catalogFor(presets, 'en-US').map((e) => e.preset.id);
    expect(ids).toEqual(['receipt-us']);
  });

  it('a contributed preset surfaces only for its declared locales', () => {
    const merged = [...presets, contribution('acme-invoice', ['ja'], { ja: 'ACME 請求書' })];
    expect(catalogFor(merged, 'ja-JP').map((e) => e.preset.id)).toContain('acme-invoice');
    expect(catalogFor(merged, 'en-US').map((e) => e.preset.id)).not.toContain('acme-invoice');
  });

  it('resolves the display name through the language chain', () => {
    const entry = catalogFor(presets, 'ja-JP').find((e) => e.preset.id === 'genkoyoshi-ja');
    expect(entry?.displayName).toBe('原稿用紙');
  });

  it('falls back to en, then the id, when the chain has no name key', () => {
    const entries = catalogFor(presets, 'ja-JP');
    expect(entries.find((e) => e.preset.id === 'only-en-name')?.displayName).toBe('Fallback');
    expect(entries.find((e) => e.preset.id === 'nameless')?.displayName).toBe('nameless');
  });

  it('returns nothing for an empty preset list', () => {
    expect(catalogFor([], 'ja-JP')).toEqual([]);
  });
});

describe('wantsDefinitions', () => {
  it('asks for the file when the catalog says it is there', () => {
    expect(wantsDefinitions({ definitions: true })).toBe(true);
  });

  // The blank presets carry no definitions, which is the whole reason the
  // fetch is skippable — and the case a first-time user starts from.
  it.each([
    ['an entry that declares nothing', {}],
    ['an entry that declares false', { definitions: false }],
    ['no entry at all (an id the catalog does not carry)', undefined],
  ])('does not ask for %s', (_case, entry) => {
    expect(wantsDefinitions(entry)).toBe(false);
  });

  // `catalog.json` is fetched at runtime, so the field's TYPE is a
  // compile-time claim about a file this code does not produce. A stale or
  // hand-edited catalog must read as "do not ask", never as "ask".
  it.each([
    ['the string "yes"', 'yes'],
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['an object', {}],
    ['an array', []],
    ['null', null],
  ])('refuses %s, which is truthy but is not true', (_case, value) => {
    expect(wantsDefinitions({ definitions: value } as { definitions?: boolean })).toBe(false);
  });
});
