import { describe, expect, it } from 'vitest';
import type { CatalogPreset } from './manifest';
import { isSafeAssetName, thumbnailUrl } from './paths';

const preset = (id: string, thumbnail: string): CatalogPreset => ({
  id,
  locales: ['ja'],
  engineLocale: 'ja-JP',
  name: { ja: 'x' },
  thumbnail,
});

describe('isSafeAssetName', () => {
  it('accepts fixed-charset names', () => {
    expect(isSafeAssetName('preview-1.png')).toBe(true);
    expect(isSafeAssetName('genkoyoshi_ja')).toBe(true);
  });

  it('rejects separators and traversal', () => {
    expect(isSafeAssetName('a/b')).toBe(false);
    expect(isSafeAssetName('a b')).toBe(false);
    expect(isSafeAssetName('.')).toBe(false);
    expect(isSafeAssetName('..')).toBe(false);
  });
});

describe('thumbnailUrl', () => {
  it('joins a fixed path for safe names', () => {
    expect(thumbnailUrl('https://x/data/', preset('receipt-us', 'preview-1.png'))).toBe(
      'https://x/data/presets/receipt-us/preview-1.png',
    );
  });

  it('returns null when the id or thumbnail is unsafe', () => {
    expect(thumbnailUrl('https://x/', preset('../etc', 'p.png'))).toBeNull();
    expect(thumbnailUrl('https://x/', preset('ok', '../secret.png'))).toBeNull();
  });
});
