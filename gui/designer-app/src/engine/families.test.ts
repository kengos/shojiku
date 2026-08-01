import { describe, expect, it } from 'vitest';
import { defaultFamilyFrom, familiesFromManifest } from './families';

describe('familiesFromManifest', () => {
  it('collects face families in order — family over id, deduped', () => {
    const manifest = [
      'faces:',
      '  - id: biz-udp-gothic',
      '  - id: biz-udp-gothic-bold',
      '    family: biz-udp-gothic',
      '  - id: biz-ud-gothic',
    ].join('\n');
    expect(familiesFromManifest(manifest)).toEqual(['biz-udp-gothic', 'biz-ud-gothic']);
  });

  it('skips malformed faces (non-map, missing/empty/non-string/over-long names)', () => {
    const manifest = [
      'faces:',
      '  - plain-string',
      '  - [list]',
      '  - weight: bold',
      '  - id: 42',
      '  - id: ""',
      `  - id: ${'x'.repeat(121)}`,
      '  - id: ok-face',
    ].join('\n');
    expect(familiesFromManifest(manifest)).toEqual(['ok-face']);
  });

  it('returns empty for a non-map root, a missing faces list, and a non-list faces', () => {
    expect(familiesFromManifest('just a string')).toEqual([]);
    expect(familiesFromManifest('- a\n- b')).toEqual([]);
    expect(familiesFromManifest('version: 1')).toEqual([]);
    expect(familiesFromManifest('faces: nope')).toEqual([]);
  });

  it('returns empty instead of throwing on an alias bomb', () => {
    const bomb = `a: &x 1\nb: [${'*x, '.repeat(80)}*x]`;
    expect(familiesFromManifest(bomb)).toEqual([]);
  });
});

describe('defaultFamilyFrom', () => {
  const BIZ_MANIFEST = [
    'faces:',
    '  - id: biz-udp-gothic',
    '  - id: biz-udp-gothic-bold',
    '    family: biz-udp-gothic',
    '    weight: bold',
  ].join('\n');

  const localePack = (defaultFace: string) =>
    ['fonts:', '  uses: [biz-ud]', `  default: ${defaultFace}`].join('\n');

  it('resolves the pack default face to its family across the manifests', () => {
    const family = defaultFamilyFrom(localePack('biz-udp-gothic'), [BIZ_MANIFEST]);
    expect(family).toBe('biz-udp-gothic');
  });

  it('resolves a bold default face to its parent family', () => {
    const family = defaultFamilyFrom(localePack('biz-udp-gothic-bold'), [BIZ_MANIFEST]);
    expect(family).toBe('biz-udp-gothic');
  });

  it('returns undefined for a builtin locale (no pack text)', () => {
    expect(defaultFamilyFrom(null, [BIZ_MANIFEST])).toBeUndefined();
  });

  it('returns undefined when the pack has no fonts.default', () => {
    expect(defaultFamilyFrom('fonts:\n  uses: [biz-ud]', [BIZ_MANIFEST])).toBeUndefined();
    expect(defaultFamilyFrom('locale: ja-JP', [BIZ_MANIFEST])).toBeUndefined();
    expect(defaultFamilyFrom('fonts: not-a-map', [BIZ_MANIFEST])).toBeUndefined();
  });

  it('returns undefined when the default face is in no manifest', () => {
    expect(defaultFamilyFrom(localePack('missing-face'), [BIZ_MANIFEST])).toBeUndefined();
  });

  it('returns undefined when the matching face has an invalid (empty) family', () => {
    // The id matches but the declared family is an empty string → no usable
    // family name to seed.
    const manifest = 'faces:\n  - id: odd-face\n    family: ""\n';
    expect(defaultFamilyFrom(localePack('odd-face'), [manifest])).toBeUndefined();
  });

  it('tolerates a malformed / non-list manifest without throwing', () => {
    expect(defaultFamilyFrom(localePack('biz-udp-gothic'), ['just a string'])).toBeUndefined();
    expect(defaultFamilyFrom(localePack('biz-udp-gothic'), ['faces: nope'])).toBeUndefined();
  });

  it('returns undefined instead of throwing on an alias-bomb pack', () => {
    const bomb = `a: &x 1\nb: [${'*x, '.repeat(80)}*x]`;
    expect(defaultFamilyFrom(bomb, [BIZ_MANIFEST])).toBeUndefined();
  });

  it('keeps a hostile default face id inert (matched by ===, never indexed)', () => {
    // A `default: __proto__` / `constructor` matches no face → undefined, and
    // never walks a prototype (the face id is compared, not used as a key).
    expect(defaultFamilyFrom(localePack('__proto__'), [BIZ_MANIFEST])).toBeUndefined();
    expect(defaultFamilyFrom(localePack('constructor'), [BIZ_MANIFEST])).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects an over-long default face id', () => {
    expect(defaultFamilyFrom(localePack('x'.repeat(121)), [BIZ_MANIFEST])).toBeUndefined();
  });
});
