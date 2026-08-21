// @vitest-environment node
//
// Preset asset injection against the REAL wasm engine (never a mock). A
// template that references a bundled image (`src: assets/logo.svg`, the
// receipt-ja shape) renders only if the host injected the bytes under that
// relative path — this suite is the parity evidence for that seam:
//
//   - injected via the EnginePrep wiring shape (`addAssetFile('assets/<name>')`),
//     the render is error-free, and a SECOND render still resolves the asset
//     (assets are session-retained, NOT consumed by loads like font packs)
//   - the same render WITHOUT the injection fails with the engine's
//     "was not injected" error (proving the injection is load-bearing)
//
// The pkg is imported DYNAMICALLY (a non-literal specifier) so tsc never binds
// the app package to the gitignored `engine/wasm/pkg`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWasmTransport } from '@shojiku/designer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FontFile, FontIndex, FontPack } from '../assets/manifest';
import { LAZY_THRESHOLD } from '../build/assemble';
import { loadPresetAssets } from '../engine/assetSource';
import { bootEngine } from '../engine/boot';
import { makeFontSource } from '../engine/fontSource';
import type { WasmFullEngine } from '../engine/wasmModule';

// src/integration/ -> repo root is four levels up.
const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);
const PACKS_BASE = fileURLToPath(new URL('packs/', REPO));
const FONTS_DIR = fileURLToPath(new URL('packs/fonts/', REPO));
// The assembled tree serves `presets/<id>/assets/<name>`; on disk the same
// files live at `examples/<id>/assets/<name>` — the node fetch maps the one
// path segment so loadPresetAssets exercises its REAL url joining.
const REPO_BASE = fileURLToPath(REPO);

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
  'defaults: { locale: en-US }',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: image',
  '        box: { w: 120, h: 60 }',
  '        src: assets/logo.svg',
  '',
].join('\n');

function errorItems(diagnostics: { items: readonly { severity: string; message: string }[] }) {
  return diagnostics.items.filter((d) => d.severity === 'error');
}

let wasmModule: WasmModule;

beforeAll(async () => {
  wasmModule = await loadModule();
});

async function bootedEngine(): Promise<WasmFullEngine> {
  const engine = new wasmModule.Engine();
  const capabilities = (JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] })
    .capabilities;
  await bootEngine({
    engine,
    capabilities,
    localeTag: 'en-US',
    localeOverlay: null,
    index: indexFromDisk(),
    fonts: makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index: indexFromDisk(),
    }),
  });
  return engine;
}

describe('preset asset injection against the real engine', () => {
  it('renders a bundled-image template once the assets are injected, across re-renders', async () => {
    const engine = await bootedEngine();
    // The assetSource fetch + the EnginePrep injection wiring, over the real
    // receipt-ja logo bytes on disk (the regression's own asset).
    const fetchFromExamples = (url: string) =>
      fetchBytesNode(url.replace('presets/receipt-ja/', 'examples/business/receipt-ja/'));
    const assets = await loadPresetAssets(
      { fetchBytes: fetchFromExamples, base: REPO_BASE },
      'receipt-ja',
      ['logo.svg'],
    );
    for (const asset of assets) {
      engine.addAssetFile(`assets/${asset.name}`, asset.bytes);
    }
    const transport = createWasmTransport(engine);
    const first = await transport.renderRaw(TEMPLATE, '{}', undefined, { scale: 1 });
    expect(first.ok).toBe(true);
    expect(errorItems(first.diagnostics)).toEqual([]);
    expect(first.pages.length).toBe(1);
    // Assets are retained by the session — a re-render (the preview loop's
    // normal life) must still resolve them.
    const second = await transport.renderRaw(TEMPLATE, '{}', undefined, { scale: 1 });
    expect(second.ok).toBe(true);
    expect(errorItems(second.diagnostics)).toEqual([]);
  });

  it('fails with the not-injected error when the injection is withheld', async () => {
    // The negative proving the injection is load-bearing: same engine, same
    // template, no addAssetFile.
    const engine = await bootedEngine();
    const outcome = await createWasmTransport(engine)
      .renderRaw(TEMPLATE, '{}', undefined, { scale: 1 })
      .catch((e: unknown) => e);
    if (outcome instanceof Error) {
      expect(outcome.message).toMatch(/was not injected/);
    } else {
      const errors = errorItems(
        (outcome as { diagnostics: { items: { severity: string; message: string }[] } })
          .diagnostics,
      );
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((d) => d.message.includes('was not injected'))).toBe(true);
    }
  });
});
