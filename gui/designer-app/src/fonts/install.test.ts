import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import type { WasmFullEngine } from '../engine/wasmModule';
import type { CatalogFamily } from './catalog';
import { applyLibrary, fetchFamily } from './install';
import { FontLibrary } from './library';
import { composeOverlay } from './overlay';
import type { GoogleFontSource } from './source';

// Node 24 exposes the same WebCrypto the browser host passes in.
const subtle = globalThis.crypto.subtle;

const family: CatalogFamily = {
  id: 'lato',
  family: 'Lato',
  category: 'Sans Serif',
  subsets: ['latin'],
  license: 'OFL-1.1',
  licenseFile: 'OFL.txt',
  licenseUrl: 'https://raw.githubusercontent.com/google/fonts/abc/ofl/lato/OFL.txt',
  faces: [
    { file: 'Lato-Regular.ttf', url: 'https://raw.githubusercontent.com/x/Lato-Regular.ttf' },
    {
      file: 'Lato-Bold.ttf',
      url: 'https://raw.githubusercontent.com/x/Lato-Bold.ttf',
      weight: 'bold',
    },
  ],
};

function source(overrides: Partial<GoogleFontSource> = {}): GoogleFontSource {
  return {
    face: vi.fn(async (url: string) => new TextEncoder().encode(`bytes:${url}`)),
    license: vi.fn(async () => 'Copyright (c) Lato'),
    ...overrides,
  };
}

describe('fetchFamily', () => {
  it('fetches each face once and pins the digest of those exact bytes', async () => {
    const src = source();
    const { font, bytes } = await fetchFamily(family, { source: src, subtle });

    expect(src.face).toHaveBeenCalledTimes(2);
    expect(font.packId).toBe('gf-lato');
    expect(font.familyId).toBe('gf-lato');
    expect(font.displayName).toBe('Lato');
    expect(font.licenseText).toBe('Copyright (c) Lato');
    expect([...bytes.keys()]).toEqual(['Lato-Regular.ttf', 'Lato-Bold.ttf']);

    // The manifest's sha256 must be the digest of the bytes handed back — a
    // re-fetch could pin something that was never injected.
    const manifest = parse(font.manifest) as { faces: { file: string; sha256: string }[] };
    const regular = bytes.get('Lato-Regular.ttf');
    expect(regular).toBeDefined();
    const digest = await subtle.digest('SHA-256', (regular as Uint8Array).slice().buffer);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(manifest.faces[0].sha256).toBe(hex);
  });

  it('propagates a fetch failure rather than installing a partial family', async () => {
    const src = source({ face: vi.fn().mockRejectedValue(new Error('offline')) });
    await expect(fetchFamily(family, { source: src, subtle })).rejects.toThrow('offline');
  });
});

/** A fake engine recording what was injected. Structural — the real one is
 * exercised by the wasm integration test. */
function fakeEngine(faces: Record<string, { file: string; url?: string }[]>) {
  const injected: { packId: string; file: string; bytes: Uint8Array }[] = [];
  const packs: { packId: string; manifest: string }[] = [];
  let locale: { tag: string; overlay: string | null } | null = null;
  const engine = {
    setLocale: vi.fn((tag: string, overlay: string | null) => {
      locale = { tag, overlay };
    }),
    addFontPack: vi.fn((packId: string, manifest: string) => {
      packs.push({ packId, manifest });
    }),
    fontFacesNeeded: vi.fn((packId: string) => JSON.stringify(faces[packId] ?? [])),
    addFontFile: vi.fn((packId: string, file: string, bytes: Uint8Array) => {
      injected.push({ packId, file, bytes });
    }),
    loadFontsSubset: vi.fn(() => JSON.stringify([])),
  } as unknown as WasmFullEngine;
  return {
    engine,
    injected,
    packs,
    get locale() {
      return locale;
    },
  };
}

function deps(fake: ReturnType<typeof fakeEngine>, library: FontLibrary, over = {}) {
  return {
    engine: fake.engine,
    library,
    source: source(),
    base: {
      manifest: vi.fn(async (packId: string) => `manifest:${packId}`),
      face: vi.fn(async (_p: string, file: string) => new TextEncoder().encode(`bundled:${file}`)),
    },
    localeTag: 'ja-JP',
    baseOverlay: null,
    baseUses: ['biz-ud', 'ipamj-mincho'],
    injectPackIds: ['biz-ud'],
    composeOverlay,
    ...over,
  };
}

describe('applyLibrary', () => {
  it('names every pack in the overlay before loading', async () => {
    const fake = fakeEngine({
      'biz-ud': [{ file: 'B.ttf' }],
      'gf-lato': [{ file: 'L.ttf', url: 'u' }],
    });
    const library = new FontLibrary();
    library.add({
      packId: 'gf-lato',
      familyId: 'gf-lato',
      displayName: 'Lato',
      manifest: 'picked',
      licenseFile: 'OFL.txt',
      licenseText: 'c',
    });
    library.remember('gf-lato', 'L.ttf', new Uint8Array([5]));

    await applyLibrary(deps(fake, library));

    expect(fake.locale?.tag).toBe('ja-JP');
    // The overlay restates the FULL declared uses — including the lazy pack
    // whose bytes are not injected — plus the picked pack.
    expect(parse(fake.locale?.overlay ?? '')).toEqual({
      fonts: { uses: ['biz-ud', 'ipamj-mincho', 'gf-lato'] },
    });
  });

  it('re-injects the bundled packs alongside the picked one', async () => {
    // The engine consumes injected packs per load: injecting only the new pack
    // would lose the default face.
    const fake = fakeEngine({
      'biz-ud': [{ file: 'B.ttf' }],
      'gf-lato': [{ file: 'L.ttf', url: 'u' }],
    });
    const library = new FontLibrary();
    library.add({
      packId: 'gf-lato',
      familyId: 'gf-lato',
      displayName: 'Lato',
      manifest: 'picked',
      licenseFile: 'OFL.txt',
      licenseText: 'c',
    });
    library.remember('gf-lato', 'L.ttf', new Uint8Array([5]));

    await applyLibrary(deps(fake, library));

    expect(fake.packs.map((p) => p.packId)).toEqual(['biz-ud', 'gf-lato']);
    expect(fake.packs[1].manifest).toBe('picked');
    expect(fake.injected.map((i) => `${i.packId}/${i.file}`)).toEqual([
      'biz-ud/B.ttf',
      'gf-lato/L.ttf',
    ]);
  });

  it('re-fetches a restored draft face from its pinned url', async () => {
    // The draft kept the manifest but not the bytes; `fontFacesNeeded` reports
    // the pin, which is the only way back to them.
    const fake = fakeEngine({ 'gf-lato': [{ file: 'L.ttf', url: 'https://pinned.test/L.ttf' }] });
    const library = new FontLibrary();
    library.restore([
      {
        packId: 'gf-lato',
        familyId: 'gf-lato',
        displayName: 'Lato',
        manifest: 'picked',
        licenseFile: 'OFL.txt',
        licenseText: 'c',
      },
    ]);
    const d = deps(fake, library, { baseUses: [], injectPackIds: [] });

    await applyLibrary(d);

    expect(d.source.face).toHaveBeenCalledWith('https://pinned.test/L.ttf');
    // And the bytes are cached, so a later reload does not re-fetch.
    expect(library.face('gf-lato', 'L.ttf')).toEqual(
      new TextEncoder().encode('bytes:https://pinned.test/L.ttf'),
    );
  });

  it('fails a restored face that carries no pin', async () => {
    const fake = fakeEngine({ 'gf-lato': [{ file: 'L.ttf' }] });
    const library = new FontLibrary();
    library.restore([
      {
        packId: 'gf-lato',
        familyId: 'gf-lato',
        displayName: 'Lato',
        manifest: 'picked',
        licenseFile: 'OFL.txt',
        licenseText: 'c',
      },
    ]);
    await expect(
      applyLibrary(deps(fake, library, { baseUses: [], injectPackIds: [] })),
    ).rejects.toThrow(/no pinned URL/);
  });

  it('returns the pack ids the load still skipped', async () => {
    const fake = fakeEngine({ 'biz-ud': [] });
    (fake.engine.loadFontsSubset as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify(['ipamj-mincho']),
    );
    await expect(applyLibrary(deps(fake, new FontLibrary()))).resolves.toEqual(['ipamj-mincho']);
  });
});
