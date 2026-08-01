import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { CatalogFamily } from './catalog';
import { buildManifest, faceIdFor, familyIdFor, packIdFor, sha256Hex } from './manifest';

// Node 24 exposes the same WebCrypto the browser host passes in.
const subtle = globalThis.crypto.subtle;

function family(overrides: Partial<CatalogFamily> = {}): CatalogFamily {
  return {
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
      {
        file: 'Lato-Italic.ttf',
        url: 'https://raw.githubusercontent.com/x/Lato-Italic.ttf',
        style: 'italic',
      },
      {
        file: 'Lato-BoldItalic.ttf',
        url: 'https://raw.githubusercontent.com/x/Lato-BoldItalic.ttf',
        weight: 'bold',
        style: 'italic',
      },
    ],
    ...overrides,
  };
}

const hashed = (f: CatalogFamily) =>
  f.faces.map((face, i) => ({ face, sha256: `${i}`.repeat(64), bytes: new Uint8Array([i]) }));

describe('ids', () => {
  it('prefixes generated ids so they cannot collide with a bundled pack', () => {
    // Face ids are a flat global namespace shared with packs/fonts/.
    expect(packIdFor(family({ id: 'noto-sans' }))).toBe('gf-noto-sans');
    expect(familyIdFor(family())).toBe('gf-lato');
  });

  it('suffixes each face id by its variant', () => {
    const f = family();
    expect(f.faces.map((face) => faceIdFor(f, face))).toEqual([
      'gf-lato',
      'gf-lato-bold',
      'gf-lato-italic',
      'gf-lato-bold-italic',
    ]);
  });
});

describe('sha256Hex', () => {
  it('matches the known digest of the empty input', () => {
    // The canonical SHA-256 of zero bytes — pins the hex encoding, not just
    // "some 64 chars".
    return expect(sha256Hex(subtle, new Uint8Array())).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes only the view, not a larger backing buffer', async () => {
    const backing = new Uint8Array([1, 2, 3, 4]);
    const view = backing.subarray(0, 0);
    await expect(sha256Hex(subtle, view)).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('buildManifest', () => {
  it('emits the engine wire for a four-face family', () => {
    const f = family();
    const parsed = parse(buildManifest(f, hashed(f))) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(parsed.license).toBe('OFL-1.1');
    expect(parsed.redistributable).toBe(true);
    expect(parsed.faces).toEqual([
      {
        id: 'gf-lato',
        file: 'Lato-Regular.ttf',
        sha256: '0'.repeat(64),
        url: 'https://raw.githubusercontent.com/x/Lato-Regular.ttf',
        family: 'gf-lato',
      },
      {
        id: 'gf-lato-bold',
        file: 'Lato-Bold.ttf',
        sha256: '1'.repeat(64),
        url: 'https://raw.githubusercontent.com/x/Lato-Bold.ttf',
        family: 'gf-lato',
        weight: 'bold',
      },
      {
        id: 'gf-lato-italic',
        file: 'Lato-Italic.ttf',
        sha256: '2'.repeat(64),
        url: 'https://raw.githubusercontent.com/x/Lato-Italic.ttf',
        family: 'gf-lato',
        style: 'italic',
      },
      {
        id: 'gf-lato-bold-italic',
        file: 'Lato-BoldItalic.ttf',
        sha256: '3'.repeat(64),
        url: 'https://raw.githubusercontent.com/x/Lato-BoldItalic.ttf',
        family: 'gf-lato',
        weight: 'bold',
        style: 'italic',
      },
    ]);
  });

  it('omits the variant keys for a single-face family', () => {
    const f = family({
      faces: [{ file: 'Bebas.ttf', url: 'https://raw.githubusercontent.com/x/B' }],
    });
    const parsed = parse(buildManifest(f, hashed(f))) as { faces: Record<string, unknown>[] };
    expect(parsed.faces).toHaveLength(1);
    expect(parsed.faces[0]).not.toHaveProperty('weight');
    expect(parsed.faces[0]).not.toHaveProperty('style');
  });

  it('is byte-stable for the same inputs', () => {
    const f = family();
    expect(buildManifest(f, hashed(f))).toBe(buildManifest(f, hashed(f)));
  });

  it('quotes a hostile family name instead of letting it rewrite the document', () => {
    // The name is upstream data. Built by string concatenation, a name carrying
    // a newline + a key would inject structure; the serializer quotes it.
    const f = family({
      id: 'evil',
      family: 'Evil\nredistributable: false\nx: "',
      faces: [{ file: 'E-Regular.ttf', url: 'https://raw.githubusercontent.com/x/E' }],
    });
    const text = buildManifest(f, hashed(f));
    const parsed = parse(text) as Record<string, unknown>;
    // Structure survives: the injected key did not become a real one.
    expect(parsed.redistributable).toBe(true);
    expect(parsed).not.toHaveProperty('x');
    expect((parsed.faces as { family: string }[])[0].family).toBe('gf-evil');
  });
});
