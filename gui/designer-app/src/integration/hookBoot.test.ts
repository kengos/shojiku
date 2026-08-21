// @vitest-environment node
//
// The hook-registry boot composition against the REAL wasm engine (never a
// mock): the app's bundled font source is SEEDED through `collectBoot` exactly
// as main.tsx does, the collected chain feeds `bootEngine`, and the booted
// engine renders Japanese text glyph-clean — proving the registry path is
// load-bearing for the first paint, not decoration. The negative leg boots
// from an EMPTY composition (no defaults, nothing hooked) and fails, proving
// the seeding is what carries the fonts. A second leg proves an integrator
// `init:fonts` contribution EXTENDS the chain: a source serving a pack the
// app source is blinded to answers through the composed chain.
//
// The pkg is imported DYNAMICALLY (a non-literal specifier) so tsc never binds
// the app package to the gitignored `engine/wasm/pkg`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chainFontSources,
  createWasmTransport,
  HOOK_EVENTS,
  type HookNotificationMap,
  type HookProviderMap,
  HookRegistry,
} from '@shojiku/designer';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectBoot } from '../app/hookup';
import type { FontFile, FontIndex, FontPack } from '../assets/manifest';
import { LAZY_THRESHOLD } from '../build/assemble';
import { bootEngine } from '../engine/boot';
import { makeFontSource } from '../engine/fontSource';
import { MISSING_GLYPH } from '../engine/lazyFonts';
import type { WasmFullEngine } from '../engine/wasmModule';

// src/integration/ -> repo root is four levels up.
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

const TEMPLATE = [
  'version: "0.1.0"',
  'page: { size: A4 }',
  'defaults: { locale: ja-JP }',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        box: { w: 400, h: 48 }',
  '        text: "領収書 合計金額"',
  '        style: { fontSize: 24 }',
  '',
].join('\n');

function freshRegistry() {
  return new HookRegistry<HookNotificationMap, HookProviderMap>(HOOK_EVENTS);
}

function capabilitiesOf(mod: WasmModule): string[] {
  return (JSON.parse(mod.Engine.capabilities()) as { capabilities: string[] }).capabilities;
}

const index = indexFromDisk();
let wasmModule: WasmModule;

beforeAll(async () => {
  wasmModule = await loadModule();
});

describe('the hook-registry boot against the real engine', () => {
  it('boots ja-JP through the registry-collected font chain and renders glyph-clean', async () => {
    const registry = freshRegistry();
    const boot = await collectBoot(registry, {
      presets: [],
      fontSource: makeFontSource({
        fetchText: fetchTextNode,
        fetchBytes: fetchBytesNode,
        base: PACKS_BASE,
        index,
      }),
    });
    expect(boot.fontSources).toHaveLength(1);

    const engine = new wasmModule.Engine();
    await bootEngine({
      engine,
      capabilities: capabilitiesOf(wasmModule),
      localeTag: 'ja-JP',
      index,
      fonts: chainFontSources(boot.fontSources),
    });
    const outcome = await createWasmTransport(engine).renderRaw(TEMPLATE, '{}', undefined, {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.code === MISSING_GLYPH)).toEqual([]);
  });

  it('an EMPTY registry boots nothing — the registration is load-bearing', async () => {
    const boot = await collectBoot(freshRegistry());
    expect(boot.fontSources).toEqual([]);
    const engine = new wasmModule.Engine();
    await expect(
      bootEngine({
        engine,
        capabilities: capabilitiesOf(wasmModule),
        localeTag: 'ja-JP',
        index,
        fonts: chainFontSources(boot.fontSources),
      }),
    ).rejects.toThrowError(/no font source resolved/);
  });

  it('an integrator font source answers for a pack the app source is blinded to', async () => {
    // The app source gets an index WITHOUT the ja packs; the "package" source
    // serves the real bytes. Only the composed chain can boot.
    const registry = freshRegistry();
    registry.hook('init:fonts', (ctx) => {
      ctx.addSource(
        makeFontSource({
          fetchText: fetchTextNode,
          fetchBytes: fetchBytesNode,
          base: PACKS_BASE,
          index,
        }),
      );
    });
    const boot = await collectBoot(registry, {
      presets: [],
      fontSource: makeFontSource({
        fetchText: fetchTextNode,
        fetchBytes: fetchBytesNode,
        base: PACKS_BASE,
        index: { packs: {} },
      }),
    });
    expect(boot.fontSources).toHaveLength(2);

    const engine = new wasmModule.Engine();
    const { absentPackIds } = await bootEngine({
      engine,
      capabilities: capabilitiesOf(wasmModule),
      localeTag: 'ja-JP',
      index,
      fonts: chainFontSources(boot.fontSources),
    });
    expect(absentPackIds).not.toContain('biz-udp-gothic');
    const outcome = await createWasmTransport(engine).renderRaw(TEMPLATE, '{}', undefined, {
      scale: 2,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics.items.filter((d) => d.code === MISSING_GLYPH)).toEqual([]);
  });
});
