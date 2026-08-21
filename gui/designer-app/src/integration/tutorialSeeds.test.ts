// @vitest-environment node
//
// Every chapter of the tutorial hands the reader a document to work on. Those
// documents are hand-authored, so this suite renders each one through the REAL
// ja-JP engine and requires it to be diagnostics-CLEAN — a course that teaches
// from a page carrying a warning teaches the warning too.
//
// This lives in the app package, not the component's: the component's wasm
// suite boots en-US with a Latin-only font lineup, where the seeds' Japanese
// text would raise `missing_glyph` for reasons that have nothing to do with the
// course. Here the ja pack is loaded exactly as the app loads it.
//
// The pkg is imported DYNAMICALLY so tsc never binds this package to the
// gitignored `engine/wasm/pkg`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COURSE, createWasmTransport, PRACTICE_PARAMS, TOPICS } from '@shojiku/designer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FontFile, FontIndex, FontPack } from '../assets/manifest';
import { LAZY_THRESHOLD } from '../build/assemble';
import { bootEngine } from '../engine/boot';
import { makeFontSource } from '../engine/fontSource';
import type { WasmFullEngine } from '../engine/wasmModule';

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
    throw new Error('engine/wasm/pkg is missing — run `make engine:wasm` before the gui gates');
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

const index = indexFromDisk();

let transport: ReturnType<typeof createWasmTransport>;

beforeAll(async () => {
  const wasmModule = await loadModule();
  const engine = new wasmModule.Engine();
  const capabilities = (JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] })
    .capabilities;
  const boot = await bootEngine({
    engine,
    capabilities,
    localeTag: 'ja-JP',
    localeOverlay: null,
    index,
    fonts: makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index,
    }),
  });
  // The lazy-tier rare-glyph fallback is deliberately not booted, so it is the
  // one pack allowed to be absent; anything else missing would show up as a
  // `missing_glyph` in the renders below.
  expect(boot.absentPackIds.filter((id) => index.packs[id]?.tier !== 'lazy')).toEqual([]);
  transport = createWasmTransport(engine);
});

describe('every tutorial chapter seed renders clean on the real ja engine', () => {
  for (const chapter of COURSE.chapters) {
    it(`renders ${chapter.id} with no diagnostics`, async () => {
      const outcome = await transport.renderRaw(chapter.seed, PRACTICE_PARAMS, undefined, {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      // WARNING-clean, not just error-free: an off-page band item, an
      // overflowing fixed-height box or an unsupported SVG element all show up
      // here and nowhere else in the gates.
      expect(outcome.diagnostics.items).toEqual([]);
      expect(outcome.pages.length).toBeGreaterThan(0);
    });
  }

  // The topic shorts run on their own practice documents (a chapter seed reused,
  // or a topic-specific one). Each must render as clean as the chapters — a
  // topic that teaches from a warning teaches the warning too.
  for (const topic of TOPICS) {
    it(`renders the ${topic.id} practice document with no diagnostics`, async () => {
      const seed = topic.chapters[0].seed;
      const outcome = await transport.renderRaw(seed, topic.params ?? PRACTICE_PARAMS, undefined, {
        scale: 2,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.diagnostics.items).toEqual([]);
      expect(outcome.pages.length).toBeGreaterThan(0);
    });
  }

  it('lays the finished invoice out on one page, footer and all', async () => {
    const last = COURSE.chapters[COURSE.chapters.length - 1];
    const outcome = await transport.renderRaw(last.seed, PRACTICE_PARAMS, undefined, { scale: 2 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error('render failed');
    }
    expect(outcome.pages).toHaveLength(1);
    // The band's page-number item is addressable, which is what proves the
    // footer actually laid out rather than falling off the sheet.
    const paths = outcome.inspect?.boxes.pages.flat().map((box) => box.path) ?? [];
    expect(paths.some((path) => path.startsWith('sections.footer'))).toBe(true);
  });
});
