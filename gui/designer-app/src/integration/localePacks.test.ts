// @vitest-environment node
//
// The shipped locale packs against the REAL wasm engine (never a mock). The
// engine holds builtins for ja-JP / en-US only; a zh-TW preset renders only if
// the app FETCHES packs/locale/zh-tw.yml and passes it to setLocale. This suite
// is the parity evidence for that seam:
//
//   - the pack + its font pack render Traditional Chinese with no missing_glyph
//   - the same tag WITHOUT the pack throws the engine's typed locale error
//     (proving the pack is load-bearing, not decoration)
//
// The pkg is imported DYNAMICALLY (a non-literal specifier) so tsc never binds
// the app package to the gitignored `engine/wasm/pkg`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWasmTransport, LOCALES } from '@shojiku/designer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FontFile, FontIndex, FontPack, LocaleIndex } from '../assets/manifest';
import { buildLocaleIndex, LAZY_THRESHOLD } from '../build/assemble';
import { bootEngine } from '../engine/boot';
import { makeFontSource } from '../engine/fontSource';
import { MISSING_GLYPH } from '../engine/lazyFonts';
import { makeLocaleSource } from '../engine/localeSource';
import type { WasmFullEngine } from '../engine/wasmModule';

// src/integration/ -> repo root is four levels up.
const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);
const PACKS_BASE = fileURLToPath(new URL('packs/', REPO));
const FONTS_DIR = fileURLToPath(new URL('packs/fonts/', REPO));
const LOCALE_DIR = fileURLToPath(new URL('packs/locale/', REPO));
const EXAMPLES_DIR = fileURLToPath(new URL('examples/', REPO));

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: { new (): WasmFullEngine; capabilities(): string };
}

async function loadModule(): Promise<WasmModule> {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error('engine/wasm/pkg is missing — run `make wasm` before the gui gates');
  }
  const mod = (await import(PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
  return mod;
}

function indexFromDisk(): FontIndex {
  const packs: Record<string, FontPack> = {};
  for (const id of readdirSync(FONTS_DIR)) {
    const dir = join(FONTS_DIR, id);
    if (!statSync(dir).isDirectory()) {
      continue;
    }
    const files: Record<string, FontFile> = {};
    let total = 0;
    for (const name of readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f))) {
      const size = statSync(join(dir, name)).size;
      total += size;
      files[name] = { name, size };
    }
    packs[id] = { tier: total > LAZY_THRESHOLD ? 'lazy' : 'primary', files };
  }
  return { packs };
}

const fetchTextNode = (url: string): Promise<string> => Promise.resolve(readFileSync(url, 'utf8'));
const fetchBytesNode = (url: string): Promise<Uint8Array> =>
  Promise.resolve(new Uint8Array(readFileSync(url)));

// Traditional-only forms (發/傳 are 发/传 in Simplified): they resolve from
// noto-sans-tc and would be missing from a Latin-only lineup.
const TC_TEXT = '收據 發票 傳統中文';
const SC_TEXT = '收据 发票 简体中文';
// Thai-only glyphs, and the string a Latin-only lineup would render as
// `.notdef` boxes: only noto-sans-thai carries them.
const THAI_TEXT = 'ใบเสร็จรับเงิน ภาษาไทย';

const templateFor = (locale: string, text: string) =>
  [
    'version: "0.1.0"',
    'page: { size: A4 }',
    `defaults: { locale: ${locale} }`,
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        box: { w: 400, h: 48 }',
    `        text: "${text}"`,
    '        style: { fontSize: 24 }',
    '',
  ].join('\n');

const index = indexFromDisk();
const localeIndex: LocaleIndex = buildLocaleIndex(readdirSync(LOCALE_DIR));
const locales = makeLocaleSource({
  fetchText: fetchTextNode,
  base: PACKS_BASE,
  index: localeIndex,
});

function capabilitiesOf(mod: WasmModule): string[] {
  return (JSON.parse(mod.Engine.capabilities()) as { capabilities: string[] }).capabilities;
}

function missingGlyphCount(diagnostics: { items: readonly { code: string }[] }): number {
  return diagnostics.items.filter((d) => d.code === MISSING_GLYPH).length;
}

let wasmModule: WasmModule;

beforeAll(async () => {
  wasmModule = await loadModule();
});

describe('shipped locale packs against the real engine', () => {
  it('indexes every shipped pack, and no builtin', () => {
    // The packs the app can fetch; ja-JP/en-US are builtin and ship no file.
    expect(localeIndex.locales).toContain('zh-tw');
    expect(localeIndex.locales).toContain('zh-cn');
    expect(localeIndex.locales).toContain('th-th');
    expect(localeIndex.locales).not.toContain('ja-jp');
  });

  it.each([
    ['zh-TW', TC_TEXT],
    ['zh-CN', SC_TEXT],
    ['th-TH', THAI_TEXT],
  ])('boots %s from its fetched pack and renders its glyphs', async (tag, text) => {
    const engine = new wasmModule.Engine();
    const fonts = makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index,
    });

    const localeOverlay = await locales.overlayFor(tag);
    expect(localeOverlay).not.toBeNull();

    const { absentPackIds } = await bootEngine({
      engine,
      capabilities: capabilitiesOf(wasmModule),
      localeTag: tag,
      localeOverlay,
      index,
      fonts,
    });
    // Each of these is its locale's DEFAULT face, not a rare-glyph
    // fallback: it must be primary-tier so the first paint has its glyphs.
    expect(absentPackIds).toEqual([]);

    const outcome = await createWasmTransport(engine).renderRaw(
      templateFor(tag, text),
      '{}',
      undefined,
      { scale: 2 },
    );
    expect(outcome.ok).toBe(true);
    expect(missingGlyphCount(outcome.diagnostics)).toBe(0);
  });

  it('returns no overlay for a builtin locale, which still boots', async () => {
    const engine = new wasmModule.Engine();
    const fonts = makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index,
    });
    expect(await locales.overlayFor('ja-JP')).toBeNull();
    await expect(
      bootEngine({
        engine,
        capabilities: capabilitiesOf(wasmModule),
        localeTag: 'ja-JP',
        localeOverlay: null,
        index,
        fonts,
      }),
    ).resolves.toBeDefined();
  });

  it('throws the engine typed locale error when the pack is withheld', () => {
    // The negative that proves the fetch is load-bearing: zh-TW has no builtin,
    // so setLocale without the pack fails with a typed code the host branches
    // on — never a silent fall back to some other locale.
    const engine = new wasmModule.Engine();
    let thrown: unknown;
    try {
      engine.setLocale('zh-TW', null);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { code?: unknown }).code).toBe('locale_error');
  });
});

// The locale-keyed blank presets are only real if every registry
// engine locale actually sets up on the engine, and the two newly-used
// standalone packs render their blank template with no diagnostics.
const freshFonts = () =>
  makeFontSource({ fetchText: fetchTextNode, fetchBytes: fetchBytesNode, base: PACKS_BASE, index });

const distinctEngineLocales = [...new Set(LOCALES.map((locale) => locale.engineLocale))].sort();

// The blank presets whose engine locale has NO builtin — the pack file is
// load-bearing at boot (fil-PH, hi-IN).
//
// th-TH is deliberately absent: the preset CATALOG is keyed to the
// Designer's chrome locales, and there is no Thai chrome, so a Thai preset
// could never surface (`blankCatalog.test.ts` calls that an orphan). Its
// pack is still exercised — by the fetched-pack render case above.
// Values are `<bucket>/<id>` under examples/ (grouped by document kind).
const PACK_BLANKS: Record<string, string> = {
  'fil-PH': 'presets/blank-letter-fil',
  'hi-IN': 'presets/blank-a4-hi',
};

describe('locale-keyed blank presets against the real engine', () => {
  it.each(distinctEngineLocales)('boots the %s engine locale from the registry', async (tag) => {
    const engine = new wasmModule.Engine();
    const overlay = await locales.overlayFor(tag);
    // A pack file exists exactly for the non-builtin engine locales; a builtin
    // (ja-JP / en-US) returns no overlay yet still boots.
    const hasPack = existsSync(join(LOCALE_DIR, `${tag.toLowerCase()}.yml`));
    expect(overlay === null, tag).toBe(!hasPack);
    await expect(
      bootEngine({
        engine,
        capabilities: capabilitiesOf(wasmModule),
        localeTag: tag,
        localeOverlay: overlay,
        index,
        fonts: freshFonts(),
      }),
    ).resolves.toBeDefined();
  });

  it.each(Object.entries(PACK_BLANKS))(
    'renders the %s blank template warning-clean with fonts booted',
    async (tag, dir) => {
      const engine = new wasmModule.Engine();
      const overlay = await locales.overlayFor(tag);
      expect(overlay).not.toBeNull();
      const { absentPackIds } = await bootEngine({
        engine,
        capabilities: capabilitiesOf(wasmModule),
        localeTag: tag,
        localeOverlay: overlay,
        index,
        fonts: freshFonts(),
      });
      expect(absentPackIds).toEqual([]);
      const template = readFileSync(join(EXAMPLES_DIR, dir, 'templates.yml'), 'utf8');
      const outcome = await createWasmTransport(engine).renderRaw(template, '{}', undefined, {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.diagnostics.items).toEqual([]);
    },
  );
});
