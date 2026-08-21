// @vitest-environment node
//
// The lazy-font loop against the REAL wasm engine (never a mock): boot ja-JP
// with the PRIMARY packs only (the heavy ipamj-mincho fallback skipped), render
// a document with a rare-name kanji → `missing_glyph` fires and the subset load
// reports ipamj-mincho absent → run the lazy loader to fetch + inject it →
// re-render and the glyph resolves. This is the parity evidence that the app's
// boot + lazy modules drive the same engine `shojiku render` does.
//
// The pkg is imported DYNAMICALLY (a non-literal specifier) so tsc never binds
// the app package to the gitignored `engine/wasm/pkg`; a missing pkg fails fast
// with a "run `make engine:wasm`" message.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWasmTransport, type EngineTransport } from '@shojiku/designer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FontFile, FontIndex, FontPack } from '../assets/manifest';
import { LAZY_THRESHOLD } from '../build/assemble';
import { bootEngine } from '../engine/boot';
import { type FontSource, makeFontSource } from '../engine/fontSource';
import { LazyFontLoader, MISSING_GLYPH, UNKNOWN_FONT_FAMILY } from '../engine/lazyFonts';
import type { WasmFullEngine } from '../engine/wasmModule';

// src/integration/ -> repo root is four levels up.
const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);
const PACKS_BASE = fileURLToPath(new URL('packs/', REPO));
const FONTS_DIR = fileURLToPath(new URL('packs/fonts/', REPO));
// The 原稿用紙(横書き) preset AUTHORS a lazy-tier `fontFamily: ipamj-mincho`, the
// exact bug shape: absent at boot, so the engine reports
// `unknown_font_family` (never `missing_glyph`) and the old trigger never fired.
const PRESET_TEMPLATE = fileURLToPath(
  new URL('examples/typography/genkoyoshi-yoko-ja/templates.yml', REPO),
);
const PRESET_PARAMS = fileURLToPath(
  new URL('examples/typography/genkoyoshi-yoko-ja/params.json', REPO),
);

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: { new (): WasmFullEngine; capabilities(): string };
}

async function loadModule(): Promise<WasmModule> {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error('engine/wasm/pkg is missing — run `make engine:wasm` before the gui gates');
  }
  const mod = (await import(PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
  return mod;
}

// A font index built from the real packs on disk WITHOUT chunking (faces are
// fetched whole from `packs/`); chunk reassembly is unit-tested separately in
// fontSource.test.ts. Tiering matches the assembly (heavy packs → lazy).
function indexFromDisk(): FontIndex {
  const packs: Record<string, FontPack> = {};
  for (const id of readdirSync(FONTS_DIR)) {
    const dir = join(FONTS_DIR, id);
    if (!statSync(dir).isDirectory()) {
      continue;
    }
    const faceNames = readdirSync(dir).filter((f) => /\.(ttf|otf)$/i.test(f));
    const files: Record<string, FontFile> = {};
    let total = 0;
    for (const name of faceNames) {
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

// A rare-name kanji (CJK Ext B, U+20BB7) absent from the primary JP lineup but
// covered by the ipamj-mincho rare-kanji fallback.
const RARE_KANJI = '\u{20BB7}';
const template = [
  'version: "0.1.0"',
  'page: { size: A4 }',
  'defaults: { locale: ja-JP }',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        box: { w: 300, h: 48 }',
  `        text: "${RARE_KANJI}野家"`,
  '        style: { fontSize: 24 }',
  '',
].join('\n');

const index = indexFromDisk();
let wasmModule: WasmModule;

function codeCount(diagnostics: { items: readonly { code: string }[] }, code: string): number {
  return diagnostics.items.filter((d) => d.code === code).length;
}
const missingGlyphCount = (d: { items: readonly { code: string }[] }): number =>
  codeCount(d, MISSING_GLYPH);
const unknownFamilyCount = (d: { items: readonly { code: string }[] }): number =>
  codeCount(d, UNKNOWN_FONT_FAMILY);

// Inject a FULL pack set into a fresh engine and load — the ground-truth store
// the preview must match once the lazy upgrade has run (same input + same store
// ⇒ byte-identical render, determinism).
async function injectAllPacks(
  engine: WasmFullEngine,
  fonts: FontSource,
  packIds: readonly string[],
): Promise<void> {
  for (const packId of packIds) {
    engine.addFontPack(packId, await fonts.manifest(packId));
    const files = JSON.parse(engine.fontFilesNeeded(packId)) as string[];
    for (const file of files) {
      engine.addFontFile(packId, file, await fonts.face(packId, file));
    }
  }
  engine.loadFontsSubset();
}

// Wrap a FontSource to count fetches — proves the typo path fires no round-trip.
function countingFonts(inner: FontSource): FontSource & { fetches: number } {
  const wrapper = {
    fetches: 0,
    manifest(id: string): Promise<string> {
      wrapper.fetches += 1;
      return inner.manifest(id);
    },
    face(id: string, file: string): Promise<Uint8Array> {
      wrapper.fetches += 1;
      return inner.face(id, file);
    },
  };
  return wrapper;
}

beforeAll(async () => {
  wasmModule = await loadModule();
});

describe('lazy font-pack fetch against the real engine (ja-JP)', () => {
  it('skips the heavy fallback at boot, then fetches it on missing_glyph', async () => {
    const engine = new wasmModule.Engine();
    const capabilities = (
      JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] }
    ).capabilities;
    const fonts = makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index,
    });

    // Boot with primary packs only; the heavy ipamj-mincho is reported absent.
    const { absentPackIds, packIds } = await bootEngine({
      engine,
      capabilities,
      localeTag: 'ja-JP',
      index,
      fonts,
    });
    expect(absentPackIds).toContain('ipamj-mincho');

    const transport: EngineTransport = createWasmTransport(engine);
    const first = await transport.renderRaw(template, '{}', undefined, { scale: 2 });
    expect(first.ok).toBe(true);
    expect(missingGlyphCount(first.diagnostics)).toBeGreaterThan(0);

    // The lazy loader re-injects the full pack set and reloads the store.
    const loader = new LazyFontLoader({ engine, fonts, packIds: () => packIds, absentPackIds });
    const upgraded = await loader.observe(first.diagnostics);
    expect(upgraded).toBe(true);
    expect(loader.status).toBe('upgraded');

    // Re-render: the rare glyph now resolves — no missing_glyph.
    const second = await transport.renderRaw(template, '{}', undefined, { scale: 2 });
    expect(second.ok).toBe(true);
    expect(missingGlyphCount(second.diagnostics)).toBe(0);
  });

  it('does not fetch when no glyph is missing (single-flight stays idle)', async () => {
    const engine = new wasmModule.Engine();
    const capabilities = (
      JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] }
    ).capabilities;
    const fonts = makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index,
    });
    const { absentPackIds, packIds } = await bootEngine({
      engine,
      capabilities,
      localeTag: 'ja-JP',
      index,
      fonts,
    });
    const loader = new LazyFontLoader({ engine, fonts, packIds: () => packIds, absentPackIds });
    // A common-kanji document produces no missing_glyph, so no fetch happens.
    const plain = template.replace(`${RARE_KANJI}野家`, '定食');
    const transport = createWasmTransport(engine);
    const outcome = await transport.renderRaw(plain, '{}', undefined, { scale: 2 });
    expect(missingGlyphCount(outcome.diagnostics)).toBe(0);
    expect(await loader.observe(outcome.diagnostics)).toBe(false);
    expect(loader.status).toBe('idle');
  });
});

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function makeDiskFonts(): FontSource {
  return makeFontSource({
    fetchText: fetchTextNode,
    fetchBytes: fetchBytesNode,
    base: PACKS_BASE,
    index,
  });
}

describe('lazy upgrade fires on a preset-authored lazy-tier fontFamily', () => {
  it('upgrades on unknown_font_family and the preview matches the full-pack render', async () => {
    const engine = new wasmModule.Engine();
    const capabilities = (
      JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] }
    ).capabilities;
    const fonts = makeDiskFonts();

    // Boot ja-JP with primary packs only; the authored ipamj-mincho is absent.
    const { absentPackIds, packIds } = await bootEngine({
      engine,
      capabilities,
      localeTag: 'ja-JP',
      index,
      fonts,
    });
    expect(absentPackIds).toContain('ipamj-mincho');

    const templateSrc = readFileSync(PRESET_TEMPLATE, 'utf8');
    const params = readFileSync(PRESET_PARAMS, 'utf8');
    const transport: EngineTransport = createWasmTransport(engine);

    // First render: the authored family is absent, so the engine falls back to a
    // glyph-complete face — `unknown_font_family` fires but `missing_glyph` never
    // does. This is exactly why the old missing_glyph-only trigger never fired.
    const first = await transport.renderRaw(templateSrc, params, undefined, {
      scale: 2,
      pageIndex: 0,
    });
    expect(first.ok).toBe(true);
    expect(unknownFamilyCount(first.diagnostics)).toBeGreaterThan(0);
    expect(missingGlyphCount(first.diagnostics)).toBe(0);

    // The widened trigger upgrades on unknown_font_family.
    const loader = new LazyFontLoader({ engine, fonts, packIds: () => packIds, absentPackIds });
    expect(await loader.observe(first.diagnostics)).toBe(true);
    expect(loader.status).toBe('upgraded');

    // Re-render: the authored family now resolves — the warning clears.
    const second = await transport.renderRaw(templateSrc, params, undefined, {
      scale: 2,
      pageIndex: 0,
    });
    expect(second.ok).toBe(true);
    expect(unknownFamilyCount(second.diagnostics)).toBe(0);
    expect(missingGlyphCount(second.diagnostics)).toBe(0);

    // The typeface actually changed (the pixels differ)…
    const before = first.pages[0].rgba;
    const after = second.pages[0].rgba;
    expect(bytesEqual(before, after)).toBe(false);

    // …and now byte-matches a ground-truth render from a FRESH engine with the
    // FULL pack set injected (what `shojiku render` produces with packs present).
    const truthEngine = new wasmModule.Engine();
    truthEngine.setLocale('ja-JP', null);
    await injectAllPacks(truthEngine, fonts, packIds);
    const truth = await createWasmTransport(truthEngine).renderRaw(templateSrc, params, undefined, {
      scale: 2,
      pageIndex: 0,
    });
    expect(bytesEqual(after, truth.pages[0].rgba)).toBe(true);
  });

  it('does not fetch on a genuine typo when nothing is absent (no wasted round-trip)', async () => {
    const engine = new wasmModule.Engine();
    const capabilities = (
      JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] }
    ).capabilities;
    const fonts = countingFonts(makeDiskFonts());

    // en-US boots an all-primary lineup, so nothing is left absent.
    const { absentPackIds, packIds } = await bootEngine({
      engine,
      capabilities,
      localeTag: 'en-US',
      index,
      fonts,
    });
    expect(absentPackIds).toHaveLength(0);
    const afterBoot = fonts.fetches;

    // A genuine typo: an unknown family with no absent pack to disambiguate it.
    const typo = [
      'version: "0.1.0"',
      'page: { size: A4 }',
      'defaults: { locale: en-US }',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        box: { w: 300, h: 48 }',
      '        text: "Hello"',
      '        style: { fontFamily: no-such-font, fontSize: 24 }',
      '',
    ].join('\n');
    const transport = createWasmTransport(engine);
    const outcome = await transport.renderRaw(typo, '{}', undefined, { scale: 2 });
    expect(unknownFamilyCount(outcome.diagnostics)).toBeGreaterThan(0);
    expect(missingGlyphCount(outcome.diagnostics)).toBe(0);

    const loader = new LazyFontLoader({ engine, fonts, packIds: () => packIds, absentPackIds });
    expect(await loader.observe(outcome.diagnostics)).toBe(false);
    expect(loader.status).toBe('idle');
    // The typo triggered ZERO additional fetches beyond boot.
    expect(fonts.fetches).toBe(afterBoot);
  });
});
