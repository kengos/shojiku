import { describe, expect, it, vi } from 'vitest';
import { loadPresetAssets, MAX_PRESET_ASSET_BYTES } from './assetSource';

const BASE = 'https://x/data/';

describe('loadPresetAssets', () => {
  it('fetches each named asset under the preset base, in order', async () => {
    const fetchBytes = vi.fn(async (url: string) => new Uint8Array([url.length]));
    const assets = await loadPresetAssets({ fetchBytes, base: BASE }, 'receipt-ja', [
      'logo.svg',
      'seal.svg',
    ]);
    expect(fetchBytes).toHaveBeenNthCalledWith(
      1,
      'https://x/data/presets/receipt-ja/assets/logo.svg',
    );
    expect(fetchBytes).toHaveBeenNthCalledWith(
      2,
      'https://x/data/presets/receipt-ja/assets/seal.svg',
    );
    expect(assets.map((a) => a.name)).toEqual(['logo.svg', 'seal.svg']);
    expect(assets[0].bytes.length).toBeGreaterThan(0);
  });

  it('fetches nothing for an empty name list', async () => {
    const fetchBytes = vi.fn();
    expect(await loadPresetAssets({ fetchBytes, base: BASE }, 'p', [])).toEqual([]);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('rejects an unsafe asset name WITHOUT fetching (runtime guard over fetched catalog data)', async () => {
    const fetchBytes = vi.fn();
    await expect(
      loadPresetAssets({ fetchBytes, base: BASE }, 'p', ['../../etc/passwd']),
    ).rejects.toThrow(/unsafe asset name/);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('rejects an unsafe preset id WITHOUT fetching', async () => {
    const fetchBytes = vi.fn();
    await expect(loadPresetAssets({ fetchBytes, base: BASE }, '../p', ['a.svg'])).rejects.toThrow(
      /unsafe preset id/,
    );
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('rejects an asset whose real bytes exceed the cap', async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array(MAX_PRESET_ASSET_BYTES + 1));
    await expect(loadPresetAssets({ fetchBytes, base: BASE }, 'p', ['big.svg'])).rejects.toThrow(
      /exceeds the size cap/,
    );
  });

  it('accepts an asset exactly at the cap', async () => {
    const fetchBytes = vi.fn(async () => new Uint8Array(MAX_PRESET_ASSET_BYTES));
    const assets = await loadPresetAssets({ fetchBytes, base: BASE }, 'p', ['edge.svg']);
    expect(assets[0].bytes.length).toBe(MAX_PRESET_ASSET_BYTES);
  });
});
