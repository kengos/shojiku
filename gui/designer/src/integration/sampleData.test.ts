// @vitest-environment node
//
// Real-engine evidence (never a mock) that the sample-data generation and the
// 工房モード stub actually satisfy the engine: params generated from a bundled
// definitions schema validate with zero `params_*` diagnostics, and a
// blank-start document (sample data built with the model's edit primitives +
// an inferred definitions stub) both validates clean AND renders. Loads the
// `make engine:wasm` pkg exactly as the other integration suites do.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { EngineTransport } from '../engine/transport';
import { createWasmTransport, type WasmEngine } from '../engine/wasmTransport';
import { addSampleField } from '../sample/edit';
import { generateParams } from '../sample/generate';
import { inferDefinitions } from '../sample/inferStub';

const REPO = new URL('../../../../', import.meta.url);
const PKG_JS = new URL('engine/wasm/pkg/shojiku_wasm.js', REPO);
const PKG_WASM = new URL('engine/wasm/pkg/shojiku_wasm_bg.wasm', REPO);

interface FullEngine extends WasmEngine {
  setLocale(id: string, overlay?: string | null): void;
  fontPacksNeeded(): string;
  fontFilesNeeded(packId: string): string;
  addFontPack(id: string, manifest: string): void;
  addFontFile(packId: string, file: string, bytes: Uint8Array): void;
  loadFonts(): void;
}

interface WasmModule {
  initSync(input: { module: BufferSource }): unknown;
  Engine: new () => FullEngine;
}

const fontFile = (packId: string, name: string) =>
  fileURLToPath(new URL(`packs/fonts/${packId}/${name}`, REPO));

async function loadModule(): Promise<WasmModule> {
  if (!existsSync(fileURLToPath(PKG_WASM))) {
    throw new Error('engine/wasm/pkg is missing — run `make engine:wasm` before the gui gates');
  }
  const mod = (await import(PKG_JS.href)) as unknown as WasmModule;
  mod.initSync({ module: readFileSync(fileURLToPath(PKG_WASM)) });
  return mod;
}

function preparedEngine(mod: WasmModule): FullEngine {
  const engine = new mod.Engine();
  engine.setLocale('en-US', null);
  const packs = JSON.parse(engine.fontPacksNeeded()) as string[];
  for (const packId of packs) {
    engine.addFontPack(packId, readFileSync(fontFile(packId, 'manifest.yml'), 'utf8'));
    const files = JSON.parse(engine.fontFilesNeeded(packId)) as string[];
    for (const file of files) {
      engine.addFontFile(packId, file, readFileSync(fontFile(packId, file)));
    }
  }
  engine.loadFonts();
  return engine;
}

const example = (name: string) =>
  readFileSync(fileURLToPath(new URL(`examples/business/invoice-en/${name}`, REPO)), 'utf8');

let transport: EngineTransport;

beforeAll(async () => {
  transport = createWasmTransport(preparedEngine(await loadModule()));
});

const paramsDiagnostics = (items: readonly { code: string }[]) =>
  items.filter((d) => d.code.startsWith('params_'));

describe('sample-data generation against the real engine', () => {
  it('generates params from a bundled definitions schema that validate with no params_* diagnostics', async () => {
    const definitions = example('definitions.yml');
    const params = generateParams(definitions);
    const diagnostics = await transport.validate(example('templates.yml'), params, definitions);
    expect(paramsDiagnostics(diagnostics.items)).toEqual([]);
    expect(diagnostics.items.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('validates and renders a blank-start document from its inferred definitions stub', async () => {
    // Blank start: the user builds sample data with the model's edit primitives.
    let params = '{}';
    params = addSampleField(params, 'title', 'Quarterly report');
    params = addSampleField(params, 'count', 3);
    const stub = inferDefinitions(params);
    const template = [
      'version: 0.1.0',
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: text',
      '        data: { key: title }',
      '      - type: text',
      '        data: { key: count }',
      '',
    ].join('\n');

    const diagnostics = await transport.validate(template, params, stub);
    expect(paramsDiagnostics(diagnostics.items)).toEqual([]);
    expect(diagnostics.items.filter((d) => d.severity === 'error')).toEqual([]);

    const outcome = await transport.renderRaw(template, params, stub, { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.pages.length).toBeGreaterThan(0);
  });
});
