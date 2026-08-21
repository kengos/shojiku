// @vitest-environment node
//
// The PDF path against the REAL wasm engine (never a mock) — the evidence for
// this feature's whole promise: what the Designer downloads must be what the
// CLI writes. The committed `examples/business/receipt-ja/output.pdf` IS the
// CLI's output (the examples gate byte-compares it every run), so rendering
// the same sources through the browser engine and comparing sha256 pins
// cross-host determinism, not merely "some PDF came out".
//
// The pkg is imported DYNAMICALLY (a non-literal specifier) so tsc never binds
// the app package to the gitignored `engine/wasm/pkg`.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWasmTransport } from '@shojiku/designer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FontFile, FontIndex, FontPack } from '../assets/manifest';
import { LAZY_THRESHOLD } from '../build/assemble';
import { makeFontSource } from '../engine/fontSource';
import type { WasmFullEngine } from '../engine/wasmModule';

const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);
const PACKS_BASE = fileURLToPath(new URL('packs/', REPO));
const FONTS_DIR = fileURLToPath(new URL('packs/fonts/', REPO));
const EXAMPLE = fileURLToPath(new URL('examples/business/receipt-ja/', REPO));

/** The full engine plus the strict load the PDF path needs. */
interface PdfEngine extends WasmFullEngine {
  loadFonts(): void;
}

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: { new (): PdfEngine; capabilities(): string };
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

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

let wasmModule: WasmModule;

beforeAll(async () => {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error('engine/wasm/pkg is missing — run `make engine:wasm` before the gui gates');
  }
  wasmModule = (await import(PKG_JS.href)) as unknown as WasmModule;
  wasmModule.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
});

/** A ja-JP engine with EVERY declared pack loaded (what the app's PDF path
 * guarantees via the loader's forced load) and the example's assets injected. */
async function receiptEngine(): Promise<PdfEngine> {
  const engine = new wasmModule.Engine();
  const index = indexFromDisk();
  const fonts = makeFontSource({
    fetchText: fetchTextNode,
    fetchBytes: fetchBytesNode,
    base: PACKS_BASE,
    index,
  });
  engine.setLocale('ja-JP', null);
  const needed = (JSON.parse(engine.fontPacksNeeded()) as string[]).filter((id) =>
    Object.hasOwn(index.packs, id),
  );
  for (const packId of needed) {
    engine.addFontPack(packId, await fonts.manifest(packId));
    for (const file of JSON.parse(engine.fontFilesNeeded(packId)) as string[]) {
      engine.addFontFile(packId, file, await fonts.face(packId, file));
    }
  }
  engine.loadFonts();
  for (const name of readdirSync(join(EXAMPLE, 'assets'))) {
    engine.addAssetFile(
      `assets/${name}`,
      new Uint8Array(readFileSync(join(EXAMPLE, 'assets', name))),
    );
  }
  return engine;
}

const sources = () => ({
  template: readFileSync(join(EXAMPLE, 'templates.yml'), 'utf8'),
  params: readFileSync(join(EXAMPLE, 'params.json'), 'utf8'),
  definitions: readFileSync(join(EXAMPLE, 'definitions.yml'), 'utf8'),
});

describe('the browser PDF is the CLI PDF', () => {
  it('renders bytes identical to the committed example output', async () => {
    const transport = createWasmTransport(await receiptEngine());
    const { template, params, definitions } = sources();

    const outcome = await transport.renderPdf?.(template, params, definitions);

    expect(outcome?.ok).toBe(true);
    expect(outcome?.diagnostics.items).toEqual([]);
    const committed = new Uint8Array(readFileSync(join(EXAMPLE, 'output.pdf')));
    expect(sha256(outcome?.pdf ?? new Uint8Array())).toBe(sha256(committed));
  });

  it('renders the same bytes on a re-render of the same session', async () => {
    const transport = createWasmTransport(await receiptEngine());
    const { template, params, definitions } = sources();

    const first = await transport.renderPdf?.(template, params, definitions);
    const second = await transport.renderPdf?.(template, params, definitions);

    expect(sha256(second?.pdf ?? new Uint8Array())).toBe(sha256(first?.pdf ?? new Uint8Array()));
  });

  it('reports a document error as ok:false with diagnostics, never a throw', async () => {
    const transport = createWasmTransport(await receiptEngine());

    const outcome = await transport.renderPdf?.('{{{ not yaml', '{}', undefined);

    expect(outcome?.ok).toBe(false);
    expect(outcome?.pdf).toHaveLength(0);
    expect(outcome?.diagnostics.items.some((d) => d.code === 'parse_error')).toBe(true);
  });

  it('advertises the capability the Designer gates the action on', () => {
    const info = JSON.parse(wasmModule.Engine.capabilities()) as { capabilities: string[] };
    expect(info.capabilities).toContain('wasm.render.pdf');
  });
});
