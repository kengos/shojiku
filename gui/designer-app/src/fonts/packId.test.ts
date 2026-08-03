// @vitest-environment node
//
// The engine-rule mirror, plus the pin that matters: every family in the
// SHIPPED catalog snapshot must mint a pack id the engine accepts. That test
// reads the real `data/font-catalog.json`, so a catalog refresh that
// introduces a dotted or over-long id fails here instead of shipping a
// Designer that writes a locale pack the engine refuses to parse.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FontCatalog } from './catalog';
import { isValidPackId, MAX_PACK_ID, PACK_ID_PREFIX, packIdForFamilyId } from './packId';

const CATALOG = fileURLToPath(new URL('../../data/font-catalog.json', import.meta.url));

describe('isValidPackId', () => {
  it('accepts the shapes the bundled and generated packs use', () => {
    for (const id of ['biz-ud', 'ipamj-mincho', 'noto_sans', 'gf-lato', 'Gf-Lato2']) {
      expect(isValidPackId(id)).toBe(true);
    }
  });

  it('rejects what the engine rejects', () => {
    // A dot is the gap against `isSafeAssetName`, which admits one: a safe
    // URL segment is not automatically a usable pack id.
    for (const id of ['', 'a/b', '../evil', '/etc', '.', 'gf-foo.bar', 'a'.repeat(65)]) {
      expect(isValidPackId(id)).toBe(false);
    }
  });

  it('accepts exactly up to the length cap', () => {
    expect(isValidPackId('a'.repeat(MAX_PACK_ID))).toBe(true);
    expect(isValidPackId('a'.repeat(MAX_PACK_ID + 1))).toBe(false);
  });
});

describe('packIdForFamilyId', () => {
  it('prefixes the family id so picked packs cannot collide with bundled ones', () => {
    expect(packIdForFamilyId('lato')).toBe(`${PACK_ID_PREFIX}lato`);
  });

  it('mints a valid pack id for every family in the shipped catalog', () => {
    const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as FontCatalog;
    // Positive control: an empty or unparsed snapshot would pass vacuously.
    expect(catalog.families.length).toBeGreaterThan(1000);
    const bad = catalog.families
      .map((family) => packIdForFamilyId(family.id))
      .filter((id) => !isValidPackId(id));
    expect(bad).toEqual([]);
  });
});
