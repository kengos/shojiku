// @vitest-environment node
//
// The invoice-ja preset — a NEW catalog preset with a bundled logo asset AND
// sample-data variants — exercised end to end against the REAL wasm engine
// (never a mock). A preset that carries a `preset.yml` is a Designer-app runtime
// contract no CLI gate covers, so this suite is that coverage:
//
//   - the real templates.yml + params.json render error-free once its ja-JP
//     fonts + logo asset are injected (two pages: 22 rows)
//   - the SAME template against the `short` variant (params-short.json) renders
//     to ONE page — the variant switch visibly changes the page break, the
//     headline of the feature
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
import { loadPresetVariants } from '../engine/variantSource';
import type { WasmFullEngine } from '../engine/wasmModule';

const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);
const PACKS_BASE = fileURLToPath(new URL('packs/', REPO));
const FONTS_DIR = fileURLToPath(new URL('packs/fonts/', REPO));
const EXAMPLE = fileURLToPath(new URL('examples/business/invoice-ja/', REPO));
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

const readExample = (name: string) => readFileSync(join(EXAMPLE, name), 'utf8');

function errorItems(diagnostics: { items: readonly { severity: string; message: string }[] }) {
  return diagnostics.items.filter((d) => d.severity === 'error');
}

let wasmModule: WasmModule;

beforeAll(async () => {
  wasmModule = await loadModule();
});

/** A ja-JP engine with the invoice-ja logo injected — the app's preset-open
 * wiring shape, over the real bytes on disk. */
async function bootedPreset(): Promise<WasmFullEngine> {
  const engine = new wasmModule.Engine();
  const capabilities = (JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] })
    .capabilities;
  await bootEngine({
    engine,
    capabilities,
    localeTag: 'ja-JP',
    localeOverlay: null,
    index: indexFromDisk(),
    fonts: makeFontSource({
      fetchText: fetchTextNode,
      fetchBytes: fetchBytesNode,
      base: PACKS_BASE,
      index: indexFromDisk(),
    }),
  });
  // The bundled logo, fetched + injected exactly as App.choose does at open.
  const fetchFromExample = (url: string) =>
    fetchBytesNode(url.replace('presets/invoice-ja/', 'examples/business/invoice-ja/'));
  const assets = await loadPresetAssets(
    { fetchBytes: fetchFromExample, base: REPO_BASE },
    'invoice-ja',
    ['logo.svg'],
  );
  for (const asset of assets) {
    engine.addAssetFile(`assets/${asset.name}`, asset.bytes);
  }
  return engine;
}

describe('invoice-ja catalog preset against the real engine', () => {
  it('renders the default (22-row) variant to two pages, error-free', async () => {
    const transport = createWasmTransport(await bootedPreset());
    const outcome = await transport.renderRaw(
      readExample('templates.yml'),
      readExample('params.json'),
      undefined,
      { scale: 1 },
    );
    expect(outcome.ok).toBe(true);
    expect(errorItems(outcome.diagnostics)).toEqual([]);
    expect(outcome.pages.length).toBe(2);
  });

  it('renders the short variant to one page — the page break follows the data', async () => {
    // The variant fetch the app performs at open, over the real files on disk.
    const variants = await loadPresetVariants(
      {
        fetchText: (url) =>
          fetchTextNode(url.replace('presets/invoice-ja/', 'examples/business/invoice-ja/')),
        base: REPO_BASE,
      },
      'invoice-ja',
      [{ id: 'short', name: { en: 'Short' } }],
    );
    expect(variants).toHaveLength(1);
    const transport = createWasmTransport(await bootedPreset());
    const outcome = await transport.renderRaw(
      readExample('templates.yml'),
      variants[0].text,
      undefined,
      { scale: 1 },
    );
    expect(outcome.ok).toBe(true);
    expect(errorItems(outcome.diagnostics)).toEqual([]);
    expect(outcome.pages.length).toBe(1);
  });
});
