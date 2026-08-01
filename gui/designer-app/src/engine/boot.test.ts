import { describe, expect, it } from 'vitest';
import type { FontIndex } from '../assets/manifest';
import { BootError, bootEngine, SUBSET_CAPABILITY } from './boot';
import type { FontSource } from './fontSource';
import type { WasmFullEngine } from './wasmModule';

interface EngineConfig {
  needed: string[];
  filesByPack: Record<string, string[]>;
  absent: string[];
}

class FakeEngine implements WasmFullEngine {
  localeSet: [string, string | null] | null = null;
  injectedPacks: string[] = [];
  injectedFiles: [string, string][] = [];
  constructor(private readonly cfg: EngineConfig) {}
  validate(): string {
    return '{"items":[]}';
  }
  renderRaw(): unknown {
    return {};
  }
  setLocale(id: string, overlay?: string | null): void {
    this.localeSet = [id, overlay ?? null];
  }
  fontPacksNeeded(): string {
    return JSON.stringify(this.cfg.needed);
  }
  fontFilesNeeded(packId: string): string {
    return JSON.stringify(this.cfg.filesByPack[packId] ?? []);
  }
  fontFacesNeeded(packId: string): string {
    // The bundled packs ship their bytes, so they declare no url hints.
    return JSON.stringify((this.cfg.filesByPack[packId] ?? []).map((file) => ({ file })));
  }
  addFontPack(id: string): void {
    this.injectedPacks.push(id);
  }
  addFontFile(packId: string, file: string): void {
    this.injectedFiles.push([packId, file]);
  }
  addAssetFile(): void {}
  loadFontsSubset(): string {
    return JSON.stringify(this.cfg.absent);
  }
}

const index: FontIndex = {
  packs: {
    'biz-ud': { tier: 'primary', files: { 'b.ttf': { name: 'b.ttf', size: 1 } } },
    'noto-sans-mono': { tier: 'primary', files: { 'm.ttf': { name: 'm.ttf', size: 1 } } },
    unused: { tier: 'primary', files: { 'u.ttf': { name: 'u.ttf', size: 1 } } },
    'ipamj-mincho': { tier: 'lazy', files: { 'i.ttf': { name: 'i.ttf', size: 1 } } },
  },
};

const fonts: FontSource = {
  manifest: async (id) => `manifest:${id}`,
  face: async () => new Uint8Array([1]),
};

const CAPS = [SUBSET_CAPABILITY];

describe('bootEngine', () => {
  it('throws when the subset capability is absent', async () => {
    const engine = new FakeEngine({ needed: [], filesByPack: {}, absent: [] });
    await expect(
      bootEngine({ engine, capabilities: [], localeTag: 'ja-JP', index, fonts }),
    ).rejects.toBeInstanceOf(BootError);
  });

  it('injects the needed primary packs, skips lazy + un-needed, returns absent', async () => {
    const engine = new FakeEngine({
      needed: ['biz-ud', 'noto-sans-mono', 'ipamj-mincho'],
      filesByPack: { 'biz-ud': ['b.ttf'], 'noto-sans-mono': ['m.ttf'] },
      absent: ['ipamj-mincho'],
    });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      index,
      fonts,
    });
    expect(engine.localeSet).toEqual(['ja-JP', null]);
    // 'unused' is primary but not needed; 'ipamj-mincho' is lazy — both skipped.
    expect(engine.injectedPacks).toEqual(['biz-ud', 'noto-sans-mono']);
    expect(engine.injectedFiles).toEqual([
      ['biz-ud', 'b.ttf'],
      ['noto-sans-mono', 'm.ttf'],
    ]);
    expect(result.absentPackIds).toEqual(['ipamj-mincho']);
    // The full re-inject set = every needed pack present in the index.
    expect(result.packIds).toEqual(['biz-ud', 'noto-sans-mono', 'ipamj-mincho']);
  });

  it('collects the authorable families across primary AND lazy packs, deduped', async () => {
    const manifestCalls: string[] = [];
    const yamlFonts: FontSource = {
      manifest: async (id) => {
        manifestCalls.push(id);
        if (id === 'biz-ud') {
          return 'faces:\n  - id: biz-udp-gothic\n  - id: biz-udp-gothic-bold\n    family: biz-udp-gothic\n  - id: biz-ud-gothic\n';
        }
        if (id === 'ipamj-mincho') {
          // The repeated biz-ud-gothic face pins the cross-pack family dedupe.
          return 'faces:\n  - id: ipamj-mincho\n  - id: biz-ud-gothic\n';
        }
        return 'faces:\n  - id: noto-sans-mono\n';
      },
      face: async () => new Uint8Array([1]),
    };
    const engine = new FakeEngine({
      needed: ['biz-ud', 'noto-sans-mono', 'ipamj-mincho'],
      filesByPack: { 'biz-ud': ['b.ttf'], 'noto-sans-mono': ['m.ttf'] },
      absent: ['ipamj-mincho'],
    });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      index,
      fonts: yamlFonts,
    });
    // Bold variants collapse into their parent family; the lazy pack's family
    // is offered too (authoring it rides the unknown_font_family upgrade).
    expect(result.familyIds).toEqual([
      'biz-udp-gothic',
      'biz-ud-gothic',
      'noto-sans-mono',
      'ipamj-mincho',
    ]);
    // Primary manifests are reused from the injection loop — only the lazy
    // pack costs an extra manifest fetch.
    expect(manifestCalls.filter((id) => id === 'biz-ud')).toHaveLength(1);
    expect(manifestCalls.filter((id) => id === 'ipamj-mincho')).toHaveLength(1);
  });

  it('skips a pack whose manifest fetch fails (families shrink, boot survives)', async () => {
    const yamlFonts: FontSource = {
      manifest: async (id) => {
        if (id === 'ipamj-mincho') {
          throw new Error('offline');
        }
        return 'faces:\n  - id: biz-udp-gothic\n';
      },
      face: async () => new Uint8Array([1]),
    };
    const engine = new FakeEngine({
      needed: ['biz-ud', 'ipamj-mincho'],
      filesByPack: { 'biz-ud': ['b.ttf'] },
      absent: ['ipamj-mincho'],
    });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      index,
      fonts: yamlFonts,
    });
    expect(result.familyIds).toEqual(['biz-udp-gothic']);
  });

  it('passes a locale overlay through to setLocale', async () => {
    const engine = new FakeEngine({ needed: [], filesByPack: {}, absent: [] });
    await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      localeOverlay: 'overlay-yaml',
      index,
      fonts,
    });
    expect(engine.localeSet).toEqual(['ja-JP', 'overlay-yaml']);
  });

  it('resolves the default family from a locale pack overlay', async () => {
    const yamlFonts: FontSource = {
      manifest: async (id) =>
        id === 'biz-ud' ? 'faces:\n  - id: biz-udp-gothic\n' : 'faces:\n  - id: noto-sans-mono\n',
      face: async () => new Uint8Array([1]),
    };
    const engine = new FakeEngine({
      needed: ['biz-ud'],
      filesByPack: { 'biz-ud': ['b.ttf'] },
      absent: [],
    });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'zh-TW',
      localeOverlay: 'fonts:\n  uses: [biz-ud]\n  default: biz-udp-gothic\n',
      index,
      fonts: yamlFonts,
    });
    expect(result.defaultFamily).toBe('biz-udp-gothic');
  });

  it('falls back to the first authorable family for a builtin locale (no overlay)', async () => {
    const yamlFonts: FontSource = {
      manifest: async () => 'faces:\n  - id: biz-udp-gothic\n  - id: biz-ud-gothic\n',
      face: async () => new Uint8Array([1]),
    };
    const engine = new FakeEngine({
      needed: ['biz-ud'],
      filesByPack: { 'biz-ud': ['b.ttf'] },
      absent: [],
    });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      index,
      fonts: yamlFonts,
    });
    // No pack text (builtin) → the first family (the default face's, by pack
    // order) is the fallback.
    expect(result.defaultFamily).toBe('biz-udp-gothic');
  });

  it('leaves the default family undefined when the locale offers no families', async () => {
    const engine = new FakeEngine({ needed: [], filesByPack: {}, absent: [] });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      index,
      fonts,
    });
    expect(result.defaultFamily).toBeUndefined();
  });
});

describe('bootEngine font progress', () => {
  /** An index whose face sizes differ, so a byte-weighted report is
   * distinguishable from a per-face count. */
  const weighted: FontIndex = {
    packs: {
      'biz-ud': {
        tier: 'primary',
        files: {
          'b.ttf': { name: 'b.ttf', size: 300 },
          'p.ttf': { name: 'p.ttf', size: 700 },
        },
      },
      'noto-sans-mono': { tier: 'primary', files: { 'm.ttf': { name: 'm.ttf', size: 1000 } } },
      'ipamj-mincho': { tier: 'lazy', files: { 'i.ttf': { name: 'i.ttf', size: 45_000 } } },
    },
  };

  it('declares the total before the first fetch, then advances by face BYTES', async () => {
    const engine = new FakeEngine({
      needed: ['biz-ud', 'noto-sans-mono', 'ipamj-mincho'],
      filesByPack: { 'biz-ud': ['b.ttf', 'p.ttf'], 'noto-sans-mono': ['m.ttf'] },
      absent: ['ipamj-mincho'],
    });
    const reports: { loaded: number; total?: number }[] = [];
    await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'ja-JP',
      index: weighted,
      fonts,
      onProgress: (progress) => reports.push(progress),
    });
    // The lazy pack's 45,000 bytes are NOT in the total — it is not fetched at
    // boot, so counting it would park the bar short of done forever.
    expect(reports).toEqual([
      { loaded: 0, total: 2000 },
      { loaded: 300, total: 2000 },
      { loaded: 1000, total: 2000 },
      { loaded: 2000, total: 2000 },
    ]);
  });

  it('reports a zero total when the locale needs no primary packs', async () => {
    const engine = new FakeEngine({ needed: [], filesByPack: {}, absent: [] });
    const reports: { loaded: number; total?: number }[] = [];
    await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'en-US',
      index: weighted,
      fonts,
      onProgress: (progress) => reports.push(progress),
    });
    // A zero total is unusable, which `readProgress` degrades to an
    // indeterminate bar — never a division by zero.
    expect(reports).toEqual([{ loaded: 0, total: 0 }]);
  });

  // The index is built from the pack DIRECTORY while the engine asks for the
  // faces its MANIFEST declares. They coincide for every shipped pack; if they
  // ever diverged, the bar must fall short rather than throw or overflow.
  it('counts an unindexed face as zero bytes instead of throwing', async () => {
    const engine = new FakeEngine({
      needed: ['noto-sans-mono'],
      filesByPack: { 'noto-sans-mono': ['m.ttf', 'ghost.ttf'] },
      absent: [],
    });
    const reports: { loaded: number; total?: number }[] = [];
    await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'en-US',
      index: weighted,
      fonts,
      onProgress: (progress) => reports.push(progress),
    });
    expect(reports).toEqual([
      { loaded: 0, total: 1000 },
      { loaded: 1000, total: 1000 },
      { loaded: 1000, total: 1000 },
    ]);
  });

  // A hostile manifest face name must not resolve through Object.prototype.
  it('counts a prototype-named face as zero bytes', async () => {
    const engine = new FakeEngine({
      needed: ['noto-sans-mono'],
      filesByPack: { 'noto-sans-mono': ['constructor'] },
      absent: [],
    });
    const reports: { loaded: number; total?: number }[] = [];
    await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'en-US',
      index: weighted,
      fonts,
      onProgress: (progress) => reports.push(progress),
    });
    expect(reports).toEqual([
      { loaded: 0, total: 1000 },
      { loaded: 0, total: 1000 },
    ]);
  });

  it('boots without a progress callback at all', async () => {
    const engine = new FakeEngine({
      needed: ['noto-sans-mono'],
      filesByPack: { 'noto-sans-mono': ['m.ttf'] },
      absent: [],
    });
    const result = await bootEngine({
      engine,
      capabilities: CAPS,
      localeTag: 'en-US',
      index: weighted,
      fonts,
    });
    expect(engine.injectedFiles).toEqual([['noto-sans-mono', 'm.ttf']]);
    expect(result.absentPackIds).toEqual([]);
  });
});
