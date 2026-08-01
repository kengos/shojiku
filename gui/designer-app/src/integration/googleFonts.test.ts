// @vitest-environment node
//
// The picked-font (Google-Fonts catalog) flow against the REAL wasm engine
// (never a mock): the REAL manifest-generation code runs over a bundled face's
// bytes standing in for a fetched ttf, the controller installs the pack into a
// live session, and the engine renders `fontFamily: gf-…` with no
// unknown_font_family — sha256-verified at load, exactly like the CLI would.
// Also pinned here, because no fake-engine test can catch them:
//
// - `fontFacesNeeded` reports the generated pack's `url:` pins (the seam a
//   draft reload rides — the host never re-parses manifest.yml).
// - A draft restore (manifests only, no bytes) re-fetches through those pins.
// - Tampered bytes on a restore fail the engine's sha256 verify as a thrown
//   Error, never a crash or a silent different-font render.
// - A picked font SURVIVES the lazy missing_glyph upgrade: the loader's live
//   pack list re-injects it, so the rebuilt store keeps it (the engine consumes
//   injected packs per load — a snapshot list would silently drop the pick).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWasmTransport } from '@shojiku/designer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { FontFile, FontIndex, FontPack } from '../assets/manifest';
import { LAZY_THRESHOLD } from '../build/assemble';
import { bootEngine } from '../engine/boot';
import { type FontSource, makeFontSource } from '../engine/fontSource';
import { LazyFontLoader, MISSING_GLYPH } from '../engine/lazyFonts';
import type { WasmFullEngine } from '../engine/wasmModule';
import type { CatalogFamily } from '../fonts/catalog';
import { FontController, pickerCapable } from '../fonts/controller';
import { composeFontSource, FontLibrary } from '../fonts/library';
import type { GoogleFontSource } from '../fonts/source';

const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);
const PACKS_BASE = fileURLToPath(new URL('packs/', REPO));
const FONTS_DIR = fileURLToPath(new URL('packs/fonts/', REPO));

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

// The stand-in "Google" ttf: a real bundled face, served by URL like the
// picker's fetch layer would (the allowlist itself is unit-tested; here the
// fake source keys strictly by the pinned URL).
const FACE_URL =
  'https://raw.githubusercontent.com/google/fonts/abc123/ofl/testfam/TestFam-Regular.ttf';
const LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/abc123/ofl/testfam/OFL.txt';

const FAMILY: CatalogFamily = {
  id: 'testfam',
  family: 'Test Family',
  category: 'Sans Serif',
  subsets: ['latin'],
  license: 'OFL-1.1',
  licenseFile: 'OFL.txt',
  licenseUrl: LICENSE_URL,
  faces: [{ file: 'TestFam-Regular.ttf', url: FACE_URL }],
};

function googleSource(faceBytes: Uint8Array): GoogleFontSource {
  return {
    face: vi.fn(async (url: string) => {
      if (url !== FACE_URL) {
        throw new Error(`unexpected face url ${url}`);
      }
      return faceBytes;
    }),
    license: vi.fn(async () => 'Copyright (c) Test with Reserved Font Name "Test Family"'),
  };
}

interface Session {
  readonly engine: WasmFullEngine;
  readonly library: FontLibrary;
  readonly fonts: FontSource;
  readonly loader: LazyFontLoader;
  readonly controller: FontController;
  readonly packIds: readonly string[];
  readonly absentPackIds: readonly string[];
}

/** Mirror main.tsx's prepareEngine wiring over the on-disk packs. */
async function bootSession(
  wasmModule: WasmModule,
  localeTag: string,
  google: GoogleFontSource,
): Promise<Session> {
  const engine = new wasmModule.Engine();
  const capabilities = (JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] })
    .capabilities;
  expect(pickerCapable(capabilities)).toBe(true);
  const library = new FontLibrary();
  const base = makeFontSource({
    fetchText: fetchTextNode,
    fetchBytes: fetchBytesNode,
    base: PACKS_BASE,
    index,
  });
  const composed = composeFontSource(base, library);
  const { absentPackIds, packIds } = await bootEngine({
    engine,
    capabilities,
    localeTag,
    index,
    fonts: composed,
  });
  const loader = new LazyFontLoader({
    engine,
    fonts: composed,
    packIds: () => [...packIds, ...library.packIds()],
    absentPackIds,
  });
  const controller = new FontController({
    engine,
    library,
    google,
    base: composed,
    subtle: globalThis.crypto.subtle,
    localeTag,
    baseOverlay: null,
    baseUses: JSON.parse(engine.fontPacksNeeded()) as string[],
    primaryPackIds: packIds.filter((id) => !absentPackIds.includes(id)),
    lazyPackIds: absentPackIds,
    lazyLoaded: () => loader.status === 'upgraded',
  });
  return { engine, library, fonts: composed, loader, controller, packIds, absentPackIds };
}

const latinTemplate = (fontFamily: string) =>
  [
    'version: "0.1.0"',
    'page: { size: A4 }',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        box: { w: 300, h: 48 }',
    '        text: "Hello 0123"',
    `        style: { fontSize: 24, fontFamily: ${fontFamily} }`,
    '',
  ].join('\n');

const index = indexFromDisk();
let wasmModule: WasmModule;
let notoBytes: Uint8Array;

function codeCount(diagnostics: { items: readonly { code: string }[] }, code: string): number {
  return diagnostics.items.filter((d) => d.code === code).length;
}

beforeAll(async () => {
  wasmModule = await loadModule();
  notoBytes = new Uint8Array(readFileSync(join(FONTS_DIR, 'noto-sans/NotoSans-Regular.ttf')));
});

describe('picked Google font against the real engine', () => {
  it('installs a picked family end to end: generated manifest → verified load → render', async () => {
    const session = await bootSession(wasmModule, 'en-US', googleSource(notoBytes));
    const transport = createWasmTransport(session.engine);

    // Before the pick, the family is unknown (the negative that proves the
    // pick is load-bearing).
    const before = await transport.renderRaw(latinTemplate('gf-testfam'), '{}', undefined, {
      scale: 1,
    });
    expect(codeCount(before.diagnostics, 'unknown_font_family')).toBeGreaterThan(0);

    await session.controller.pick(FAMILY);

    // The engine reports the generated pack's pins — the seam a draft reload
    // rides; the sha stays engine-side. `fontFacesNeeded` answers for DECLARED
    // (injected, not-yet-loaded) packs — a load consumes the injection — so
    // read it from a fresh session holding just the generated manifest,
    // exactly how a reload's inject step sees it.
    const probe = new wasmModule.Engine();
    const manifest = session.library.manifest('gf-testfam');
    expect(manifest).toBeDefined();
    probe.addFontPack('gf-testfam', manifest as string);
    const faces = JSON.parse(probe.fontFacesNeeded('gf-testfam')) as {
      file: string;
      url?: string;
    }[];
    expect(faces).toEqual([{ file: 'TestFam-Regular.ttf', url: FACE_URL }]);

    const after = await transport.renderRaw(latinTemplate('gf-testfam'), '{}', undefined, {
      scale: 1,
    });
    expect(after.ok).toBe(true);
    expect(codeCount(after.diagnostics, 'unknown_font_family')).toBe(0);
    expect(codeCount(after.diagnostics, MISSING_GLYPH)).toBe(0);
  });

  it('restores a draft (manifest only, no bytes) by re-fetching through the pins', async () => {
    // First session: pick, then keep only what a draft keeps.
    const first = await bootSession(wasmModule, 'en-US', googleSource(notoBytes));
    await first.controller.pick(FAMILY);
    const draftFonts = first.library.list();
    expect(draftFonts).toHaveLength(1);

    // Fresh session, as after a reload: no bytes anywhere but the pins.
    const google = googleSource(notoBytes);
    const second = await bootSession(wasmModule, 'en-US', google);
    await second.controller.restore(draftFonts);
    expect(google.face).toHaveBeenCalledWith(FACE_URL);

    const outcome = await createWasmTransport(second.engine).renderRaw(
      latinTemplate('gf-testfam'),
      '{}',
      undefined,
      { scale: 1 },
    );
    expect(codeCount(outcome.diagnostics, 'unknown_font_family')).toBe(0);
  });

  it('fails a tampered restore loudly (sha256 mismatch is an Error, never a different font)', async () => {
    const first = await bootSession(wasmModule, 'en-US', googleSource(notoBytes));
    await first.controller.pick(FAMILY);
    const draftFonts = first.library.list();

    // The pinned URL now serves DIFFERENT bytes than the manifest's sha256.
    const tampered = new Uint8Array(readFileSync(join(FONTS_DIR, 'noto-sans/NotoSans-Bold.ttf')));
    const second = await bootSession(wasmModule, 'en-US', googleSource(tampered));
    await expect(second.controller.restore(draftFonts)).rejects.toThrow();
  });

  it('keeps a picked font through the lazy missing_glyph upgrade (live pack list)', async () => {
    // ja-JP boots with the heavy rare-kanji fallback absent.
    const session = await bootSession(wasmModule, 'ja-JP', googleSource(notoBytes));
    expect(session.absentPackIds).toContain('ipamj-mincho');
    await session.controller.pick(FAMILY);

    // One item uses the picked font; another needs a rare kanji the primary
    // lineup cannot draw.
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
      '        text: "Hello 0123"',
      '        style: { fontSize: 24, fontFamily: gf-testfam }',
      '      - type: text',
      '        box: { w: 300, h: 48 }',
      '        text: "\u{20BB7}野家"',
      '        style: { fontSize: 24 }',
      '',
    ].join('\n');

    const transport = createWasmTransport(session.engine);
    const first = await transport.renderRaw(template, '{}', undefined, { scale: 1 });
    expect(codeCount(first.diagnostics, 'unknown_font_family')).toBe(0);
    expect(codeCount(first.diagnostics, MISSING_GLYPH)).toBeGreaterThan(0);

    // The upgrade re-injects the LIVE list (boot set + the picked pack). With a
    // boot-time snapshot list this would drop gf-testfam and the re-render
    // would warn unknown_font_family — the regression this test pins.
    expect(await session.loader.observe(first.diagnostics)).toBe(true);

    const second = await transport.renderRaw(template, '{}', undefined, { scale: 1 });
    expect(codeCount(second.diagnostics, MISSING_GLYPH)).toBe(0);
    expect(codeCount(second.diagnostics, 'unknown_font_family')).toBe(0);
  });
});
