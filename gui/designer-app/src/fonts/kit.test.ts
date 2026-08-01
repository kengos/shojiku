import { addVariant, buildSampleSet, type SampleSet } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { buildExport } from '../persistence/files';
import { buildKit } from './kit';
import type { InstalledFont } from './library';

function readZip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const out: Record<string, string> = {};
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const bodyStart = nameStart + nameLen + extraLen;
    out[decoder.decode(bytes.subarray(nameStart, nameStart + nameLen))] = decoder.decode(
      bytes.subarray(bodyStart, bodyStart + size),
    );
    offset = bodyStart + size;
  }
  return out;
}

const lato: InstalledFont = {
  packId: 'gf-lato',
  familyId: 'gf-lato',
  displayName: 'Lato',
  manifest: 'version: 1\nfaces: []\n',
  licenseFile: 'OFL.txt',
  licenseText: 'Copyright (c) Lato',
};

const DEFAULT_SAMPLE = buildSampleSet('{ "total": 100 }\n', []);

const base = {
  presetId: 'receipt-us',
  text: 'version: 1\n',
  sampleSet: DEFAULT_SAMPLE,
  sampleEdited: false,
  overlay: 'fonts:\n  uses: [noto-sans, gf-lato]\n',
  localeId: 'en-US',
  plain: buildExport,
};

describe('buildKit', () => {
  it('stays a single YAML file when nothing was picked and sample data is unedited', () => {
    const out = buildKit({ ...base, fonts: [] });
    expect(out).toEqual({ filename: 'receipt-us-templates.yml', text: 'version: 1\n' });
  });

  it('produces a kit carrying edited sample data even with no fonts', () => {
    const out = buildKit({ ...base, fonts: [], sampleEdited: true }) as { bytes: Uint8Array };
    const files = readZip(out.bytes);
    expect(Object.keys(files).sort()).toEqual(['README.md', 'params.json', 'templates.yml']);
    expect(files['params.json']).toBe('{ "total": 100 }\n');
  });

  it('carries the inferred definitions stub when present', () => {
    const out = buildKit({
      ...base,
      fonts: [],
      sampleEdited: true,
      definitions: 'version: 0.2.0\ntype: object\nproperties: {}\n',
    }) as { bytes: Uint8Array };
    const files = readZip(out.bytes);
    expect(files['definitions.yml']).toBe('version: 0.2.0\ntype: object\nproperties: {}\n');
  });

  it('writes a params-<slug>.json per additional variant (preset + user)', () => {
    const withPreset = buildSampleSet('{ "total": 100 }\n', [
      { id: 'short', name: { en: 'Short' }, text: '{ "total": 1 }\n' },
    ]);
    const added = addVariant(withPreset, 'My Copy') as { ok: true; set: SampleSet };
    const out = buildKit({ ...base, sampleSet: added.set, sampleEdited: true, fonts: [] }) as {
      bytes: Uint8Array;
    };
    const files = readZip(out.bytes);
    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'params-my-copy.json',
      'params-short.json',
      'params.json',
      'templates.yml',
    ]);
    expect(files['params.json']).toBe('{ "total": 100 }\n');
    expect(files['params-short.json']).toBe('{ "total": 1 }\n');
    // The user variant duplicated the active (default) text.
    expect(files['params-my-copy.json']).toBe('{ "total": 100 }\n');
    // The README documents rendering a variant.
    expect(readZip(out.bytes)['README.md']).toContain('--params params-short.json');
  });

  it('sanitizes hostile variant names into safe params file names, deduping collisions', () => {
    let set = buildSampleSet('{}\n', []);
    for (const name of ['../../x', '__proto__', 'toString', '★★★', 'a'.repeat(200), 'X']) {
      set = (addVariant(set, name) as { ok: true; set: SampleSet }).set;
    }
    // Two names that reduce to the same stem collide → ordinal suffix.
    set = (addVariant(set, 'x') as { ok: true; set: SampleSet }).set;
    const out = buildKit({ ...base, sampleSet: set, sampleEdited: true, fonts: [] }) as {
      bytes: Uint8Array;
    };
    const names = Object.keys(readZip(out.bytes));
    for (const path of names) {
      expect(path).not.toContain('..');
      expect(path).not.toContain('/');
      expect(path).not.toContain('★');
    }
    expect(names).toContain('params-x.json');
    expect(names).toContain('params-proto.json');
    expect(names).toContain('params-tostring.json');
    expect(names).toContain('params-variant.json'); // unicode-only cleaned away
    expect(names.some((n) => /^params-x-\d\.json$/.test(n))).toBe(true); // collision suffix
  });

  it('lays the kit out the way the CLI expects', () => {
    const out = buildKit({ ...base, fonts: [lato] }) as { filename: string; bytes: Uint8Array };
    expect(out.filename).toBe('receipt-us-kit.zip');
    const files = readZip(out.bytes);
    expect(Object.keys(files).sort()).toEqual([
      'README.md',
      'packs/fonts/gf-lato/OFL.txt',
      'packs/fonts/gf-lato/manifest.yml',
      'packs/locale/en-us.yml',
      'params.json',
      'templates.yml',
    ]);
    expect(files['templates.yml']).toBe('version: 1\n');
    expect(files['params.json']).toBe('{ "total": 100 }\n');
    expect(files['packs/fonts/gf-lato/manifest.yml']).toBe(lato.manifest);
    // The licence text travels verbatim — never composed from a template body.
    expect(files['packs/fonts/gf-lato/OFL.txt']).toBe('Copyright (c) Lato');
    expect(files['packs/locale/en-us.yml']).toBe(base.overlay);
  });

  it('tells the reader how to render it and which font it needs', () => {
    const out = buildKit({ ...base, fonts: [lato] }) as { bytes: Uint8Array };
    const readme = readZip(out.bytes)['README.md'];
    // The EXACT flags the CLI accepts — this command was once written from
    // memory as `--template …` and failed on first contact.
    expect(readme).toContain(
      'shojiku render --templates templates.yml --params params.json --lang en-US --output output.pdf',
    );
    expect(readme).toContain('Lato');
    expect(readme).toContain('fontFamily: gf-lato');
    expect(readme).toContain('OFL.txt');
  });

  it('carries every picked font', () => {
    const poppins: InstalledFont = {
      ...lato,
      packId: 'gf-poppins',
      familyId: 'gf-poppins',
      displayName: 'Poppins',
    };
    const out = buildKit({ ...base, fonts: [lato, poppins] }) as { bytes: Uint8Array };
    const files = readZip(out.bytes);
    expect(files).toHaveProperty('packs/fonts/gf-lato/manifest.yml');
    expect(files).toHaveProperty('packs/fonts/gf-poppins/manifest.yml');
  });

  it('sanitizes ids into entry paths that cannot escape on extraction', () => {
    const hostile: InstalledFont = { ...lato, packId: '../../evil', licenseFile: '../OFL.txt' };
    const out = buildKit({
      ...base,
      presetId: '../../etc/passwd',
      localeId: '../../x',
      fonts: [hostile],
    }) as { filename: string; bytes: Uint8Array };
    expect(out.filename).toBe('etc-passwd-kit.zip');
    for (const path of Object.keys(readZip(out.bytes))) {
      expect(path).not.toContain('..');
    }
  });

  it('falls back to a placeholder when a name cleans away to nothing', () => {
    // `...` and `..` reduce to the empty string; an entry path must never end
    // up as `packs/fonts//manifest.yml`.
    const nameless: InstalledFont = { ...lato, packId: '...', licenseFile: '..' };
    const out = buildKit({
      ...base,
      presetId: '..',
      localeId: '...',
      fonts: [nameless],
    }) as { filename: string; bytes: Uint8Array };
    expect(out.filename).toBe('font-kit.zip');
    expect(Object.keys(readZip(out.bytes)).sort()).toEqual([
      'README.md',
      'packs/fonts/font/LICENSE.txt',
      'packs/fonts/font/manifest.yml',
      'packs/locale/font.yml',
      'params.json',
      'templates.yml',
    ]);
  });

  it('is deterministic', () => {
    const a = buildKit({ ...base, fonts: [lato] }) as { bytes: Uint8Array };
    const b = buildKit({ ...base, fonts: [lato] }) as { bytes: Uint8Array };
    expect(a.bytes).toEqual(b.bytes);
  });
});
