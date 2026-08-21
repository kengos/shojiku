// @vitest-environment node
//
// The GUI-side engine-default constants (`ENGINE_STYLE_DEFAULTS`, the document-
// defaults seed + cascade-mirror floor) pinned against the REAL wasm engine: a
// document that authors those six values explicitly must render pixel-identical
// to one that authors none (the engine already applies exactly them by default).
// If the literal ever drifts from the engine, this render diverges — the seed
// would then display a value the engine does not actually use. The host-derived
// default `fontFamily` (the boot result's `defaultFamily`) is pinned the same
// way: authoring it changes nothing.
//
// The pkg is imported DYNAMICALLY so tsc never binds this package to the
// gitignored `engine/wasm/pkg`. Boots en-US (Latin builtin) with ASCII text.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWasmTransport, ENGINE_STYLE_DEFAULTS } from '@shojiku/designer';
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

function capabilitiesOf(mod: WasmModule): string[] {
  return (JSON.parse(mod.Engine.capabilities()) as { capabilities: string[] }).capabilities;
}

/** A YAML scalar for a seeded value: bare numbers stay numbers, everything else
 * (enums, colors) quotes (a `#rrggbb` would otherwise start a YAML comment). */
function yamlScalar(value: string): string {
  return /^-?\d+(?:\.\d+)?$/.test(value) ? value : `"${value}"`;
}

/** A single-text-item template, optionally carrying a `defaults.style` block. */
function template(defaultsStyle?: Readonly<Record<string, string>>): string {
  const head = ['version: "0.1.0"', 'page: { size: A4 }'];
  if (defaultsStyle !== undefined) {
    head.push('defaults:', '  style:');
    for (const [key, value] of Object.entries(defaultsStyle)) {
      head.push(`    ${key}: ${yamlScalar(value)}`);
    }
  }
  return [
    ...head,
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        box: { w: 400, h: 60 }',
    '        text: "The quick brown fox 12345"',
    '',
  ].join('\n');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

let wasmModule: WasmModule;

beforeAll(async () => {
  wasmModule = await loadModule();
});

async function bootedTransport() {
  const engine = new wasmModule.Engine();
  const fonts = makeFontSource({
    fetchText: fetchTextNode,
    fetchBytes: fetchBytesNode,
    base: PACKS_BASE,
    index,
  });
  const boot = await bootEngine({
    engine,
    capabilities: capabilitiesOf(wasmModule),
    localeTag: 'en-US',
    localeOverlay: null,
    index,
    fonts,
  });
  return { transport: createWasmTransport(engine), boot };
}

async function renderPage(transport: ReturnType<typeof createWasmTransport>, text: string) {
  const outcome = await transport.renderRaw(text, '{}', undefined, { scale: 2 });
  expect(outcome.ok).toBe(true);
  if (!outcome.ok) {
    throw new Error('render failed');
  }
  expect(outcome.diagnostics.items).toEqual([]);
  return outcome.pages[0];
}

describe('ENGINE_STYLE_DEFAULTS against the real engine', () => {
  it('renders identically whether the six defaults are authored or implicit', async () => {
    const { transport } = await bootedTransport();
    const base = await renderPage(transport, template());
    const seeded = await renderPage(transport, template(ENGINE_STYLE_DEFAULTS));
    expect(seeded.width).toBe(base.width);
    expect(seeded.height).toBe(base.height);
    // Authoring exactly the engine defaults must not change a single pixel — the
    // proof the GUI literal matches what the engine already does.
    expect(bytesEqual(seeded.rgba, base.rgba)).toBe(true);
  });

  it('renders identically when the locale default family is authored explicitly', async () => {
    const { transport, boot } = await bootedTransport();
    expect(boot.defaultFamily).toBeDefined();
    const base = await renderPage(transport, template());
    const withFamily = await renderPage(
      transport,
      template({ fontFamily: boot.defaultFamily as string }),
    );
    expect(bytesEqual(withFamily.rgba, base.rgba)).toBe(true);
  });
});
