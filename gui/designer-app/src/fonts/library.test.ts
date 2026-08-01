import { describe, expect, it, vi } from 'vitest';
import type { FontSource } from '../engine/fontSource';
import { composeFontSource, FontLibrary, type InstalledFont } from './library';

function font(overrides: Partial<InstalledFont> = {}): InstalledFont {
  return {
    packId: 'gf-lato',
    familyId: 'gf-lato',
    displayName: 'Lato',
    manifest: 'version: 1\n',
    licenseFile: 'OFL.txt',
    licenseText: 'Copyright',
    ...overrides,
  };
}

describe('FontLibrary', () => {
  it('records a picked family and its ids', () => {
    const library = new FontLibrary();
    library.add(font());
    expect(library.has('gf-lato')).toBe(true);
    expect(library.packIds()).toEqual(['gf-lato']);
    expect(library.familyIds()).toEqual(['gf-lato']);
    expect(library.list().map((f) => f.displayName)).toEqual(['Lato']);
  });

  it('reports an unknown pack as absent', () => {
    const library = new FontLibrary();
    expect(library.has('ghost')).toBe(false);
    expect(library.manifest('ghost')).toBeUndefined();
    expect(library.face('ghost', 'x.ttf')).toBeUndefined();
  });

  it('caches face bytes so a later reload needs no fetch', () => {
    const library = new FontLibrary();
    library.add(font());
    library.remember('gf-lato', 'Lato-Regular.ttf', new Uint8Array([7]));
    expect(library.face('gf-lato', 'Lato-Regular.ttf')).toEqual(new Uint8Array([7]));
  });

  it('ignores bytes for a pack it does not hold', () => {
    const library = new FontLibrary();
    library.remember('ghost', 'x.ttf', new Uint8Array([1]));
    expect(library.face('ghost', 'x.ttf')).toBeUndefined();
  });

  it('re-picking a family replaces it without duplicating the pack', () => {
    const library = new FontLibrary();
    library.add(font());
    library.remember('gf-lato', 'Lato-Regular.ttf', new Uint8Array([7]));
    library.add(font({ displayName: 'Lato v2' }));
    expect(library.packIds()).toEqual(['gf-lato']);
    expect(library.list()[0].displayName).toBe('Lato v2');
    // The bytes survive a re-pick — the map is not recreated over them.
    expect(library.face('gf-lato', 'Lato-Regular.ttf')).toEqual(new Uint8Array([7]));
  });

  it('restores a draft with no bytes', () => {
    const library = new FontLibrary();
    library.restore([font(), font({ packId: 'gf-poppins', familyId: 'gf-poppins' })]);
    expect(library.packIds()).toEqual(['gf-lato', 'gf-poppins']);
    expect(library.face('gf-lato', 'Lato-Regular.ttf')).toBeUndefined();
  });

  it('restore REPLACES the picked set — a font picked after a restore point is dropped', () => {
    const library = new FontLibrary();
    library.add(font());
    library.add(font({ packId: 'gf-poppins', familyId: 'gf-poppins' }));
    library.remember('gf-lato', 'Lato-Regular.ttf', new Uint8Array([7]));
    // Restore a point that only held Poppins: Lato (picked after) is gone,
    // and its cached bytes with it.
    library.restore([font({ packId: 'gf-poppins', familyId: 'gf-poppins' })]);
    expect(library.packIds()).toEqual(['gf-poppins']);
    expect(library.has('gf-lato')).toBe(false);
    expect(library.face('gf-lato', 'Lato-Regular.ttf')).toBeUndefined();
  });

  it('restore to an empty set clears every picked font', () => {
    const library = new FontLibrary();
    library.add(font());
    library.restore([]);
    expect(library.packIds()).toEqual([]);
    expect(library.list()).toEqual([]);
  });
});

describe('composeFontSource', () => {
  const base: FontSource = {
    manifest: vi.fn().mockResolvedValue('bundled-manifest'),
    face: vi.fn().mockResolvedValue(new Uint8Array([9])),
  };

  it('delegates a bundled pack to the asset tree', async () => {
    const composed = composeFontSource(base, new FontLibrary());
    await expect(composed.manifest('biz-ud')).resolves.toBe('bundled-manifest');
    await expect(composed.face('biz-ud', 'a.ttf')).resolves.toEqual(new Uint8Array([9]));
  });

  it('serves a picked pack from the library, so the lazy loop cannot drop it', async () => {
    // The engine consumes injected packs on each load; the lazy upgrade
    // re-injects through this same interface.
    const library = new FontLibrary();
    library.add(font({ manifest: 'picked-manifest' }));
    library.remember('gf-lato', 'Lato-Regular.ttf', new Uint8Array([1, 2]));
    const composed = composeFontSource(base, library);
    await expect(composed.manifest('gf-lato')).resolves.toBe('picked-manifest');
    await expect(composed.face('gf-lato', 'Lato-Regular.ttf')).resolves.toEqual(
      new Uint8Array([1, 2]),
    );
  });

  it('rejects a picked face whose bytes are not loaded rather than 404ing the asset tree', async () => {
    const library = new FontLibrary();
    library.add(font());
    const composed = composeFontSource(base, library);
    await expect(composed.face('gf-lato', 'Lato-Regular.ttf')).rejects.toThrow(/not loaded/);
  });
});
