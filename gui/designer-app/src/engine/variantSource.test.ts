import { describe, expect, it, vi } from 'vitest';
import type { CatalogVariant } from '../assets/manifest';
import { loadPresetVariants, MAX_VARIANT_BYTES } from './variantSource';

const BASE = 'https://x/data/';

const DECLS: readonly CatalogVariant[] = [
  { id: 'blank', name: { ja: '空欄', en: 'Blank' } },
  { id: 'short', name: { en: 'Short' } },
];

describe('loadPresetVariants', () => {
  it('fetches each variant file under the preset base, preserving order + labels', async () => {
    const fetchText = vi.fn(async (url: string) => `{"url":${JSON.stringify(url)}}`);
    const variants = await loadPresetVariants({ fetchText, base: BASE }, 'rirekisho-ja', DECLS);
    expect(fetchText).toHaveBeenCalledWith('https://x/data/presets/rirekisho-ja/params-blank.json');
    expect(fetchText).toHaveBeenCalledWith('https://x/data/presets/rirekisho-ja/params-short.json');
    expect(variants.map((v) => v.id)).toEqual(['blank', 'short']);
    expect(variants[0].name).toEqual({ ja: '空欄', en: 'Blank' });
    expect(JSON.parse(variants[1].text).url).toContain('params-short.json');
  });

  it('fetches nothing for an empty declaration list', async () => {
    const fetchText = vi.fn();
    expect(await loadPresetVariants({ fetchText, base: BASE }, 'p', [])).toEqual([]);
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('rejects an unsafe variant id WITHOUT composing its URL', async () => {
    const fetchText = vi.fn(async () => '{}');
    await expect(
      loadPresetVariants({ fetchText, base: BASE }, 'p', [{ id: '../../etc', name: { en: 'x' } }]),
    ).rejects.toThrow(/unsafe variant id/);
    expect(fetchText).not.toHaveBeenCalledWith(expect.stringContaining('etc'));
  });

  it('rejects an unsafe preset id WITHOUT fetching', async () => {
    const fetchText = vi.fn();
    await expect(loadPresetVariants({ fetchText, base: BASE }, '../p', DECLS)).rejects.toThrow(
      /unsafe preset id/,
    );
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('rejects the whole open when one variant fetch fails', async () => {
    const fetchText = vi.fn(async (url: string) => {
      if (url.includes('short')) {
        throw new Error('404');
      }
      return '{}';
    });
    await expect(loadPresetVariants({ fetchText, base: BASE }, 'p', DECLS)).rejects.toThrow(/404/);
  });

  it('rejects a variant whose text exceeds the cap', async () => {
    const fetchText = vi.fn(async () => 'x'.repeat(MAX_VARIANT_BYTES + 1));
    await expect(
      loadPresetVariants({ fetchText, base: BASE }, 'p', [{ id: 'big', name: { en: 'x' } }]),
    ).rejects.toThrow(/exceeds the size cap/);
  });

  it('accepts a variant exactly at the cap', async () => {
    const fetchText = vi.fn(async () => 'x'.repeat(MAX_VARIANT_BYTES));
    const variants = await loadPresetVariants({ fetchText, base: BASE }, 'p', [
      { id: 'edge', name: { en: 'x' } },
    ]);
    expect(variants[0].text.length).toBe(MAX_VARIANT_BYTES);
  });
});
