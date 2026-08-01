import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import type { WasmFullEngine } from '../engine/wasmModule';
import type { CatalogFamily } from './catalog';
import { FontController, type FontControllerDeps } from './controller';
import { FontLibrary } from './library';
import type { GoogleFontSource } from './source';

const subtle = globalThis.crypto.subtle;

const family: CatalogFamily = {
  id: 'lato',
  family: 'Lato',
  category: 'Sans Serif',
  subsets: ['latin'],
  license: 'OFL-1.1',
  licenseFile: 'OFL.txt',
  licenseUrl: 'https://raw.githubusercontent.com/google/fonts/abc/ofl/lato/OFL.txt',
  faces: [{ file: 'Lato-Regular.ttf', url: 'https://raw.githubusercontent.com/x/L.ttf' }],
};

function fakeEngine(faces: Record<string, { file: string; url?: string }[]>) {
  const packs: string[] = [];
  let overlay: string | null = null;
  const engine = {
    setLocale: vi.fn((_tag: string, o: string | null) => {
      overlay = o;
    }),
    addFontPack: vi.fn((packId: string) => {
      packs.push(packId);
    }),
    fontFacesNeeded: vi.fn((packId: string) => JSON.stringify(faces[packId] ?? [])),
    addFontFile: vi.fn(),
    loadFontsSubset: vi.fn(() => JSON.stringify(['ipamj-mincho'])),
  } as unknown as WasmFullEngine;
  return {
    engine,
    packs,
    get overlay() {
      return overlay;
    },
  };
}

function make(over: Partial<FontControllerDeps> = {}) {
  const fake = fakeEngine({
    'biz-ud': [{ file: 'B.ttf' }],
    'ipamj-mincho': [{ file: 'I.ttf' }],
    'gf-lato': [{ file: 'Lato-Regular.ttf', url: 'https://raw.githubusercontent.com/x/L.ttf' }],
  });
  const library = new FontLibrary();
  const google: GoogleFontSource = {
    face: vi.fn(async () => new Uint8Array([1, 2, 3])),
    license: vi.fn(async () => 'Copyright (c) Lato'),
  };
  const controller = new FontController({
    engine: fake.engine,
    library,
    google,
    base: {
      manifest: async (id) => `manifest:${id}`,
      face: async (_id, file) => new TextEncoder().encode(`bundled:${file}`),
    },
    subtle,
    localeTag: 'ja-JP',
    baseOverlay: null,
    baseUses: ['biz-ud', 'ipamj-mincho'],
    primaryPackIds: ['biz-ud'],
    lazyPackIds: ['ipamj-mincho'],
    lazyLoaded: () => false,
    ...over,
  });
  return { controller, fake, library, google };
}

function overlayUses(text: string | null): string[] {
  return (parse(text ?? '') as { fonts: { uses: string[] } }).fonts.uses;
}

describe('pickerCapable', () => {
  it('requires BOTH the url-pin and the faces-listing capabilities', async () => {
    const { pickerCapable } = await import('./controller');
    expect(pickerCapable(['fonts.face.url', 'wasm.fonts.faces'])).toBe(true);
    expect(pickerCapable(['fonts.face.url'])).toBe(false);
    expect(pickerCapable(['wasm.fonts.faces'])).toBe(false);
    expect(pickerCapable([])).toBe(false);
  });
});

describe('FontController', () => {
  it('pick fetches, installs, and reloads with the full uses declared', async () => {
    const { controller, fake, library } = make();
    await controller.pick(family);

    expect(library.packIds()).toEqual(['gf-lato']);
    expect(library.face('gf-lato', 'Lato-Regular.ttf')).toEqual(new Uint8Array([1, 2, 3]));
    // Overlay: FULL uses (incl. the never-loaded lazy pack) + the pick.
    expect(overlayUses(fake.overlay)).toEqual(['biz-ud', 'ipamj-mincho', 'gf-lato']);
    // Injection: only what the store holds (primary) + the pick — the 45 MB
    // lazy fallback is NOT force-fetched by a pick.
    expect(fake.packs).toEqual(['biz-ud', 'gf-lato']);
    expect(controller.familyIds()).toEqual(['gf-lato']);
  });

  it('joins the lazy packs into injection once the loader has them', async () => {
    const { controller, fake } = make({ lazyLoaded: () => true });
    await controller.pick(family);
    expect(fake.packs).toEqual(['biz-ud', 'ipamj-mincho', 'gf-lato']);
  });

  it('a failed face fetch installs nothing', async () => {
    const { controller, library, fake } = make();
    const failing = make().google;
    const { controller: c2 } = make({
      google: { ...failing, face: vi.fn(async () => Promise.reject(new Error('offline'))) },
    });
    await expect(c2.pick(family)).rejects.toThrow('offline');
    expect(controller.list()).toEqual([]);
    expect(library.packIds()).toEqual([]);
    expect(fake.packs).toEqual([]);
  });

  it('restore reloads a draft library through the pins', async () => {
    const { controller, fake, google } = make();
    await controller.restore([
      {
        packId: 'gf-lato',
        familyId: 'gf-lato',
        displayName: 'Lato',
        manifest: 'picked-manifest',
        licenseFile: 'OFL.txt',
        licenseText: 'c',
      },
    ]);
    // No bytes in the library → fetched from the manifest's pin.
    expect(google.face).toHaveBeenCalledWith('https://raw.githubusercontent.com/x/L.ttf');
    expect(fake.packs).toEqual(['biz-ud', 'gf-lato']);
  });

  it('exportOverlay declares the full chain plus every pick, without loading anything', () => {
    const { controller, fake, library } = make();
    library.add({
      packId: 'gf-lato',
      familyId: 'gf-lato',
      displayName: 'Lato',
      manifest: 'm',
      licenseFile: 'OFL.txt',
      licenseText: 'c',
    });
    expect(overlayUses(controller.exportOverlay())).toEqual(['biz-ud', 'ipamj-mincho', 'gf-lato']);
    expect(fake.packs).toEqual([]);
    expect(fake.overlay).toBeNull();
  });
});
