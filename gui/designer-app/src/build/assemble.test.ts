import { describe, expect, it } from 'vitest';
import {
  buildCatalog,
  buildFontIndex,
  buildFontPack,
  buildLocaleIndex,
  CHUNK_THRESHOLD,
  LAZY_THRESHOLD,
  packTier,
  partNames,
  planFace,
  resolvePresetBuckets,
  validateAssetNames,
  validatePreset,
} from './assemble';

const valid = {
  locales: ['ja', 'JA-hira'],
  engineLocale: 'ja-JP',
  name: { ja: '原稿用紙', en: 'Manuscript' },
  thumbnail: 'preview-1.png',
};

describe('resolvePresetBuckets', () => {
  it('maps each preset id to its bucket, preserving discovery order', () => {
    const resolved = resolvePresetBuckets([
      { id: 'invoice-ja', bucket: 'business' },
      { id: 'rirekisho-ja', bucket: 'forms' },
      { id: 'blank-a4', bucket: 'presets' },
    ]);
    expect([...resolved]).toEqual([
      ['invoice-ja', 'business'],
      ['rirekisho-ja', 'forms'],
      ['blank-a4', 'presets'],
    ]);
  });

  it('rejects one id claimed by two buckets, naming both', () => {
    // Both would copy into presets/<id>/ — the last writer would win silently.
    expect(() =>
      resolvePresetBuckets([
        { id: 'receipt-ja', bucket: 'business' },
        { id: 'receipt-ja', bucket: 'forms' },
      ]),
    ).toThrow(/preset receipt-ja: duplicate id in business and forms/);
  });

  it('accepts an empty discovery (no buckets carry a manifest)', () => {
    expect(resolvePresetBuckets([]).size).toBe(0);
  });
});

describe('validateAssetNames', () => {
  it('sorts and dedupes safe names', () => {
    expect(validateAssetNames('p', ['seal.svg', 'logo.svg', 'seal.svg'])).toEqual([
      'logo.svg',
      'seal.svg',
    ]);
  });

  it('returns empty for an empty listing', () => {
    expect(validateAssetNames('p', [])).toEqual([]);
  });

  it('fails the build on an unsafe name (never normalize the index alone)', () => {
    expect(() => validateAssetNames('p', ['../evil.svg'])).toThrow(/unsafe asset file name/);
    expect(() => validateAssetNames('p', ['ok.svg', 'a b.svg'])).toThrow(/unsafe asset file name/);
  });

  it('rides the catalog: buildCatalog preserves a preset asset list untouched', () => {
    const withAssets = {
      id: 'b',
      locales: ['ja'],
      engineLocale: 'ja-JP',
      name: { ja: 'x' },
      thumbnail: 't.png',
      assets: ['logo.svg'],
    };
    const without = { ...withAssets, id: 'a', assets: undefined };
    const catalog = buildCatalog([withAssets, without]);
    expect(catalog.presets[1].assets).toEqual(['logo.svg']);
    expect(catalog.presets[0].assets).toBeUndefined();
  });
});

describe('validatePreset', () => {
  it('accepts a well-formed manifest and lowercases the locales', () => {
    expect(validatePreset('genkoyoshi-ja', valid)).toEqual({
      id: 'genkoyoshi-ja',
      locales: ['ja', 'ja-hira'],
      engineLocale: 'ja-JP',
      name: { ja: '原稿用紙', en: 'Manuscript' },
      thumbnail: 'preview-1.png',
    });
  });

  it('rejects an unsafe preset directory name', () => {
    expect(() => validatePreset('../evil', valid)).toThrow(/unsafe preset directory/);
  });

  it('rejects a non-map manifest', () => {
    expect(() => validatePreset('p', null)).toThrow(/not a map/);
    expect(() => validatePreset('p', 'nope')).toThrow(/not a map/);
  });

  it('rejects bad locales', () => {
    expect(() => validatePreset('p', { ...valid, locales: [] })).toThrow(/locales/);
    expect(() => validatePreset('p', { ...valid, locales: 'ja' })).toThrow(/locales/);
    expect(() => validatePreset('p', { ...valid, locales: ['ja/../x'] })).toThrow(/locales/);
  });

  it('rejects a bad engineLocale', () => {
    expect(() => validatePreset('p', { ...valid, engineLocale: '' })).toThrow(/engineLocale/);
    expect(() => validatePreset('p', { ...valid, engineLocale: 'ja JP' })).toThrow(/engineLocale/);
  });

  it('rejects a bad name map', () => {
    expect(() => validatePreset('p', { ...valid, name: [] })).toThrow(/name/);
    expect(() => validatePreset('p', { ...valid, name: {} })).toThrow(/name/);
    expect(() => validatePreset('p', { ...valid, name: { ja: 5 } })).toThrow(/name/);
  });

  it('rejects an unsafe thumbnail name', () => {
    expect(() => validatePreset('p', { ...valid, thumbnail: '../secret.png' })).toThrow(
      /thumbnail/,
    );
    expect(() => validatePreset('p', { ...valid, thumbnail: 42 })).toThrow(/thumbnail/);
  });

  it('accepts and carries well-formed variants', () => {
    const preset = validatePreset('rirekisho-ja', {
      ...valid,
      variants: [
        { id: 'blank', name: { ja: '空欄', en: 'Blank' } },
        { id: 'short-2', name: { en: 'Short' } },
      ],
    });
    expect(preset.variants).toEqual([
      { id: 'blank', name: { ja: '空欄', en: 'Blank' } },
      { id: 'short-2', name: { en: 'Short' } },
    ]);
  });

  it('omits the variants key when none are declared', () => {
    expect(validatePreset('p', valid).variants).toBeUndefined();
  });

  it('rejects a non-list variants field', () => {
    expect(() => validatePreset('p', { ...valid, variants: 'blank' })).toThrow(/variants/);
  });

  it('rejects a non-map variant entry', () => {
    expect(() => validatePreset('p', { ...valid, variants: ['blank'] })).toThrow(/must be a map/);
  });

  it('rejects an empty, uppercase, or unsafe variant id', () => {
    expect(() =>
      validatePreset('p', { ...valid, variants: [{ id: '', name: { en: 'x' } }] }),
    ).toThrow(/id/);
    expect(() =>
      validatePreset('p', { ...valid, variants: [{ id: 'Blank', name: { en: 'x' } }] }),
    ).toThrow(/lowercase/);
    expect(() =>
      validatePreset('p', { ...valid, variants: [{ id: '../x', name: { en: 'x' } }] }),
    ).toThrow(/id/);
  });

  it('rejects the reserved default variant id', () => {
    expect(() =>
      validatePreset('p', { ...valid, variants: [{ id: 'default', name: { en: 'x' } }] }),
    ).toThrow(/reserved/);
  });

  it('rejects duplicate variant ids', () => {
    expect(() =>
      validatePreset('p', {
        ...valid,
        variants: [
          { id: 'blank', name: { en: 'x' } },
          { id: 'blank', name: { en: 'y' } },
        ],
      }),
    ).toThrow(/duplicate variant id/);
  });

  it('rejects a bad variant name map', () => {
    expect(() => validatePreset('p', { ...valid, variants: [{ id: 'blank', name: {} }] })).toThrow(
      /name/,
    );
    expect(() =>
      validatePreset('p', { ...valid, variants: [{ id: 'blank', name: { en: 5 } }] }),
    ).toThrow(/name/);
    expect(() => validatePreset('p', { ...valid, variants: [{ id: 'blank', name: [] }] })).toThrow(
      /name/,
    );
  });

  it('accepts exactly the declared-variant cap (default + declared = the Designer cap)', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `v${i}`, name: { en: `V${i}` } }));
    expect(validatePreset('p', { ...valid, variants: eleven }).variants).toHaveLength(11);
  });

  it('rejects more variants than the cap (a 12th would be silently dropped at runtime)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, name: { en: `V${i}` } }));
    expect(() => validatePreset('p', { ...valid, variants: many })).toThrow(/too many variants/);
  });
});

describe('chunk planning', () => {
  it('names ordered parts covering the whole face', () => {
    expect(partNames('big.ttf', 30 * 1024 * 1024)).toEqual(['big.ttf.part00', 'big.ttf.part01']);
  });

  it('leaves a face under the cap whole', () => {
    expect(planFace('a.ttf', 100)).toEqual({ name: 'a.ttf', size: 100 });
  });

  it('splits a face over the cap', () => {
    const face = planFace('big.ttf', CHUNK_THRESHOLD + 1);
    expect(face.parts).toBeDefined();
  });
});

describe('packTier', () => {
  it('is primary at the boundary and lazy just past it', () => {
    expect(packTier(LAZY_THRESHOLD)).toBe('primary');
    expect(packTier(LAZY_THRESHOLD + 1)).toBe('lazy');
  });
});

describe('buildFontPack', () => {
  it('totals the faces for the tier and maps each face', () => {
    const pack = buildFontPack([
      { name: 'a.ttf', size: 10 },
      { name: 'b.ttf', size: 20 },
    ]);
    expect(pack.tier).toBe('primary');
    expect(pack.files).toEqual({
      'a.ttf': { name: 'a.ttf', size: 10 },
      'b.ttf': { name: 'b.ttf', size: 20 },
    });
  });
});

describe('buildCatalog / buildFontIndex', () => {
  it('sorts presets by id', () => {
    const catalog = buildCatalog([validatePreset('zebra', valid), validatePreset('alpha', valid)]);
    expect(catalog.presets.map((p) => p.id)).toEqual(['alpha', 'zebra']);
  });

  it('sorts font packs by id', () => {
    const index = buildFontIndex([
      { id: 'zeta', faces: [{ name: 'z.ttf', size: 1 }] },
      { id: 'alpha', faces: [{ name: 'a.ttf', size: 1 }] },
    ]);
    expect(Object.keys(index.packs)).toEqual(['alpha', 'zeta']);
  });
});

describe('buildLocaleIndex', () => {
  it('strips the extension and sorts', () => {
    expect(buildLocaleIndex(['zh-tw.yml', 'fil-ph.yml', 'hi-in.yml']).locales).toEqual([
      'fil-ph',
      'hi-in',
      'zh-tw',
    ]);
  });

  it('fails the build on a non-lowercase file name (would 404 at runtime)', () => {
    // The runtime fetches `locale/<lowercased-tag>.yml` and the CLI lowercases
    // the id the same way — an uppercase file would index but never resolve.
    expect(() => buildLocaleIndex(['zh-TW.yml'])).toThrow(/must be lowercase/);
  });

  it('ignores non-yml entries (README.md lives in packs/locale)', () => {
    expect(buildLocaleIndex(['README.md', 'zh-tw.yml']).locales).toEqual(['zh-tw']);
  });

  it('yields an empty index when no packs are shipped', () => {
    expect(buildLocaleIndex([]).locales).toEqual([]);
  });

  it('fails the build on an unsafe file name', () => {
    expect(() => buildLocaleIndex(['../../etc/passwd.yml'])).toThrow(/unsafe file name/);
  });
});
