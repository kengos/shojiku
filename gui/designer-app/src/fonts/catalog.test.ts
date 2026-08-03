import { describe, expect, it } from 'vitest';
import {
  type CatalogFamily,
  catalogSubsets,
  type FontCatalog,
  familyById,
  isUsableFamily,
  MAX_RESULTS,
  searchFamilies,
} from './catalog';

function family(overrides: Partial<CatalogFamily> = {}): CatalogFamily {
  return {
    id: 'lato',
    family: 'Lato',
    category: 'Sans Serif',
    subsets: ['latin', 'latin-ext'],
    license: 'OFL-1.1',
    licenseFile: 'OFL.txt',
    licenseUrl: 'https://raw.githubusercontent.com/google/fonts/abc/ofl/lato/OFL.txt',
    faces: [
      { file: 'Lato-Regular.ttf', url: 'https://raw.githubusercontent.com/x/Lato-Regular.ttf' },
    ],
    ...overrides,
  };
}

function catalog(families: CatalogFamily[]): FontCatalog {
  return { version: 1, ref: 'abc123', families };
}

describe('isUsableFamily', () => {
  it('accepts a well-formed entry', () => {
    expect(isUsableFamily(family())).toBe(true);
  });

  it('rejects an id that would escape the asset tree', () => {
    // The snapshot is a build artifact, but it is fetched at runtime — the id
    // becomes a URL segment and a pack directory name.
    expect(isUsableFamily(family({ id: '../../etc' }))).toBe(false);
    expect(isUsableFamily(family({ id: 'a/b' }))).toBe(false);
  });

  it('rejects an id whose minted pack id the engine would refuse', () => {
    // Safe as a URL segment, unusable as a pack id: a `uses:` entry the
    // engine refuses fails the whole locale pack, not just this font.
    expect(isUsableFamily(family({ id: 'foo.bar' }))).toBe(false);
    expect(isUsableFamily(family({ id: 'a'.repeat(62) }))).toBe(false);
    // …and one that still fits with the `gf-` prefix stays usable.
    expect(isUsableFamily(family({ id: 'a'.repeat(61) }))).toBe(true);
  });

  it('rejects an unsafe face file name or licence file name', () => {
    expect(isUsableFamily(family({ faces: [{ file: '../x.ttf', url: 'https://x.test/x' }] }))).toBe(
      false,
    );
    expect(isUsableFamily(family({ licenseFile: '../OFL.txt' }))).toBe(false);
  });

  it('rejects a licence outside OFL/Apache, whatever the snapshot claims', () => {
    // The snapshot is fetched at runtime; `redistributable: true` in the
    // generated manifest rests on this list, so the type alone is not enough.
    const gpl = family({ license: 'GPL-3.0' as CatalogFamily['license'] });
    expect(isUsableFamily(gpl)).toBe(false);
    expect(isUsableFamily(family({ license: 'Apache-2.0' }))).toBe(true);
  });

  it('rejects a family with no faces', () => {
    expect(isUsableFamily(family({ faces: [] }))).toBe(false);
  });
});

describe('searchFamilies', () => {
  it('matches the display name case-insensitively', () => {
    const c = catalog([family(), family({ id: 'roboto', family: 'Roboto Slab' })]);
    expect(searchFamilies(c, 'lat').map((f) => f.id)).toEqual(['lato']);
    expect(searchFamilies(c, 'ROBOTO').map((f) => f.id)).toEqual(['roboto']);
  });

  it('sorts by popularity rank, unranked last, id as the tiebreak', () => {
    const c = catalog([
      family({ id: 'zzz-popular', family: 'Zzz', popularity: 1 }),
      family({ id: 'mid', family: 'Mid', popularity: 40 }),
      family({ id: 'unranked-b', family: 'Ub' }),
      family({ id: 'unranked-a', family: 'Ua' }),
      family({ id: 'tie-b', family: 'Tb', popularity: 40 }),
    ]);
    expect(searchFamilies(c, '').map((f) => f.id)).toEqual([
      'zzz-popular',
      'mid',
      'tie-b',
      'unranked-a',
      'unranked-b',
    ]);
  });

  it('caps AFTER sorting, so the first screen is the popular set', () => {
    const many = Array.from({ length: MAX_RESULTS + 5 }, (_, i) =>
      family({ id: `f${i}`, family: `Family ${i}`, popularity: MAX_RESULTS + 5 - i }),
    );
    const out = searchFamilies(catalog(many), '');
    expect(out).toHaveLength(MAX_RESULTS);
    // The LAST entries by file order carry the best ranks — they must win.
    expect(out[0].popularity).toBe(1);
    expect(out.at(-1)?.popularity).toBe(MAX_RESULTS);
  });

  it('returns every usable family for an empty query', () => {
    const c = catalog([family(), family({ id: 'roboto', family: 'Roboto Slab' })]);
    expect(searchFamilies(c, '   ')).toHaveLength(2);
  });

  it('narrows by subset', () => {
    const c = catalog([family(), family({ id: 'noto', family: 'Noto JP', subsets: ['japanese'] })]);
    expect(searchFamilies(c, '', 'japanese').map((f) => f.id)).toEqual(['noto']);
  });

  it('skips unusable entries rather than offering them', () => {
    const c = catalog([family({ id: 'a/b', family: 'Bad' }), family()]);
    expect(searchFamilies(c, '').map((f) => f.id)).toEqual(['lato']);
  });

  it('caps the result count so a broad query cannot render the whole catalog', () => {
    const many = Array.from({ length: MAX_RESULTS + 10 }, (_, i) =>
      family({ id: `f${i}`, family: `Family ${i}` }),
    );
    expect(searchFamilies(catalog(many), '')).toHaveLength(MAX_RESULTS);
  });
});

describe('familyById', () => {
  it('finds a usable family and rejects an unusable or absent one', () => {
    const c = catalog([family(), family({ id: 'a/b', family: 'Bad' })]);
    expect(familyById(c, 'lato')?.family).toBe('Lato');
    expect(familyById(c, 'a/b')).toBeUndefined();
    expect(familyById(c, 'ghost')).toBeUndefined();
  });
});

describe('catalogSubsets', () => {
  it('lists every subset once, sorted', () => {
    const c = catalog([family(), family({ id: 'noto', subsets: ['japanese', 'latin'] })]);
    expect(catalogSubsets(c)).toEqual(['japanese', 'latin', 'latin-ext']);
  });
});
