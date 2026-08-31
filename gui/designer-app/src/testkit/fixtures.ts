// Shared EditorScreen-suite fixtures: the tiny preset, the fake engine /
// transport / prep, and the injected AppServices builder. Test substrate
// only — excluded from coverage.
import type { Diagnostics, EngineTransport } from '@shojiku/designer';
import { vi } from 'vitest';
import type { AppServices, EnginePrep, PresetFiles } from '../app/services';
import type { FontSource } from '../engine/fontSource';
import { LazyFontLoader, MISSING_GLYPH } from '../engine/lazyFonts';
import type { WasmFullEngine } from '../engine/wasmModule';
import type { ModuleLoad, ModuleLoadSource } from '../loading/moduleLoad';
import { BlockStore } from '../persistence/blocks';
import { DraftStore } from '../persistence/drafts';
import { SnapshotStore } from '../persistence/snapshots';

export const TEMPLATE = [
  'version: "0.1.0"',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        box: { w: 100, h: 30 }',
  '        text: "hi"',
  '',
].join('\n');

export const withGlyph: Diagnostics = {
  items: [{ severity: 'warning', code: MISSING_GLYPH, category: 'font', message: '', args: {} }],
};
export const clean: Diagnostics = { items: [] };

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

export const fakeEngine = () =>
  ({
    validate: () => '{"items":[]}',
    renderRaw: () => ({}),
    setLocale: () => {},
    fontPacksNeeded: () => '[]',
    fontFilesNeeded: () => '[]',
    fontFacesNeeded: () => '[]',
    addFontPack: () => {},
    addFontFile: () => {},
    addAssetFile: () => {},
    loadFontsSubset: () => '[]',
  }) as WasmFullEngine;

export const resolvingFonts = (): FontSource => ({
  manifest: async () => '',
  face: async () => new Uint8Array(),
});

export function transportReturning(diagnostics: Diagnostics): EngineTransport {
  return {
    validate: async () => clean,
    renderRaw: async () => ({ ok: true, pages: [], inspect: null, diagnostics }),
    renderPdf: async () => ({
      ok: true,
      pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      diagnostics,
    }),
  };
}

export const FILES: PresetFiles = { source: TEMPLATE, params: '{}', assets: [], variants: [] };

export function makePrep(
  diagnostics: Diagnostics,
  fonts: FontSource,
  absent: string[],
  capabilities?: readonly string[],
): EnginePrep {
  return {
    transport: transportReturning(diagnostics),
    loader: new LazyFontLoader({
      engine: fakeEngine(),
      fonts,
      packIds: () => absent,
      absentPackIds: absent,
    }),
    fonts: null,
    capabilities,
    injectAssets: () => {},
  };
}

/** A module-load source pinned to ONE state, for a test that just needs the
 * app to see a particular first-load situation.
 *
 * The state is captured, never rebuilt per call: `useSyncExternalStore` compares
 * `getSnapshot()` results by identity, so a `get: () => ({ kind: 'ready' })`
 * that mints a fresh literal each time looks like a value that never settles and
 * React fails the whole render with "The result of getSnapshot should be cached
 * to avoid an infinite loop" — a message that names neither the store nor the
 * component. Build these here rather than inline for that reason. */
export function fixedModuleLoad(state: ModuleLoad): ModuleLoadSource {
  return {
    subscribe: () => () => {},
    get: () => state,
  };
}

/** A module load that is already in — what every test that does not care about
 * the first-load experience wants. */
export const READY_MODULE: ModuleLoadSource = fixedModuleLoad({ kind: 'ready' });

export function services(overrides: Partial<AppServices> = {}): AppServices {
  return {
    moduleLoad: READY_MODULE,
    presets: [],
    initialLocale: 'en-US',
    persistLocale: vi.fn(),
    initialThemePref: 'auto',
    gridStep: () => 1,
    persistGridStep: vi.fn(),
    templateMaxBytes: () => 2 * 1024 * 1024,
    persistTemplateMaxBytes: vi.fn(),
    sidebarWidth: () => 240,
    tutorialStore: { load: () => null, save: () => {} },
    persistSidebarWidth: vi.fn(),
    persistThemePref: vi.fn(),
    colorSchemeMedia: null,
    drafts: new DraftStore(memoryStorage()),
    blocks: new BlockStore(memoryStorage()),
    snapshots: new SnapshotStore(memoryStorage()),
    now: () => 1_000_000,
    prepareEngine: vi.fn(),
    // Builtin-only by default: `null` is what a real source answers for a tag
    // the engine already has, so the Designer's locale panel still works.
    localePacks: { overlayFor: async () => null },
    exportFile: vi.fn(),
    openFile: vi.fn(async () => null),
    ...overrides,
  };
}
