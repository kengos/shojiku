import {
  type Diagnostics,
  type EngineTransport,
  type FormatCatalog,
  type LocaleFacts,
  type PatternProbe,
  type RenderOutcome,
  TransportError,
} from '@shojiku/designer';
import { describe, expect, it, vi } from 'vitest';
import type { FontSource } from './fontSource';
import {
  createLazyFontTransport,
  LazyFontLoader,
  MISSING_GLYPH,
  UNKNOWN_FONT_FAMILY,
} from './lazyFonts';
import type { WasmFullEngine } from './wasmModule';

const withGlyph: Diagnostics = {
  items: [{ severity: 'warning', code: MISSING_GLYPH, category: 'font', message: '', args: {} }],
};
const withUnknownFamily: Diagnostics = {
  items: [
    { severity: 'warning', code: UNKNOWN_FONT_FAMILY, category: 'font', message: '', args: {} },
  ],
};
// A non-trigger code whose MESSAGE text mentions the trigger spelling — proves
// the predicate reads the typed `code` field, never the (attacker-controlled)
// message string.
const impostorMessage: Diagnostics = {
  items: [
    {
      severity: 'warning',
      code: 'format_error',
      category: 'binding',
      message: 'unknown_font_family missing_glyph',
      args: {},
    },
  ],
};
const clean: Diagnostics = { items: [] };

function fakeEngine(): WasmFullEngine & { injected: string[]; subsetCalls: number } {
  const state = { injected: [] as string[], subsetCalls: 0 };
  return {
    ...state,
    validate: () => '{"items":[]}',
    renderRaw: () => ({}),
    setLocale: () => {},
    fontPacksNeeded: () => '[]',
    fontFilesNeeded: () => '["f.ttf"]',
    fontFacesNeeded: () => '[{"file":"f.ttf"}]',
    addFontPack(id: string) {
      this.injected.push(id);
    },
    addFontFile: () => {},
    addAssetFile: () => {},
    loadFontsSubset() {
      this.subsetCalls += 1;
      return '[]';
    },
  } as WasmFullEngine & { injected: string[]; subsetCalls: number };
}

function fakeFonts(): FontSource {
  return { manifest: vi.fn(async () => 'manifest'), face: vi.fn(async () => new Uint8Array([1])) };
}

describe('LazyFontLoader.observe', () => {
  it('stays idle when there are no absent packs', async () => {
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => [],
      absentPackIds: [],
    });
    expect(await loader.observe(withGlyph)).toBe(false);
    expect(loader.status).toBe('idle');
  });

  it('stays idle when no glyph is missing', async () => {
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    expect(await loader.observe(clean)).toBe(false);
    expect(loader.status).toBe('idle');
  });

  it('fetches + injects the absent packs and upgrades on missing_glyph', async () => {
    const engine = fakeEngine();
    const statuses: string[] = [];
    const loader = new LazyFontLoader({
      engine,
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    loader.onStatusChange = (s) => statuses.push(s);
    expect(await loader.observe(withGlyph)).toBe(true);
    expect(loader.status).toBe('upgraded');
    expect(statuses).toEqual(['fetching', 'upgraded']);
    expect(engine.injected).toEqual(['ipamj-mincho']);
    expect(engine.subsetCalls).toBe(1);
  });

  it('fetches + injects the absent packs and upgrades on unknown_font_family', async () => {
    const engine = fakeEngine();
    const statuses: string[] = [];
    const loader = new LazyFontLoader({
      engine,
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    loader.onStatusChange = (s) => statuses.push(s);
    expect(await loader.observe(withUnknownFamily)).toBe(true);
    expect(loader.status).toBe('upgraded');
    expect(statuses).toEqual(['fetching', 'upgraded']);
    expect(engine.injected).toEqual(['ipamj-mincho']);
    expect(engine.subsetCalls).toBe(1);
  });

  it('stays idle on unknown_font_family when there are no absent packs', async () => {
    const fonts = fakeFonts();
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts,
      packIds: () => [],
      absentPackIds: [],
    });
    expect(await loader.observe(withUnknownFamily)).toBe(false);
    expect(loader.status).toBe('idle');
    expect(fonts.manifest).not.toHaveBeenCalled();
  });

  it('stays idle when the trigger spelling appears only in a non-trigger message', async () => {
    const fonts = fakeFonts();
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts,
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    expect(await loader.observe(impostorMessage)).toBe(false);
    expect(loader.status).toBe('idle');
    expect(fonts.manifest).not.toHaveBeenCalled();
  });

  it('does not re-fetch after a successful unknown_font_family upgrade', async () => {
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    expect(await loader.observe(withUnknownFamily)).toBe(true);
    expect(await loader.observe(withUnknownFamily)).toBe(false);
  });

  it('is single-flight: a concurrent observe shares the in-flight fetch', async () => {
    const fonts = fakeFonts();
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts,
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    const a = loader.observe(withGlyph);
    const b = loader.observe(withGlyph);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(fonts.manifest).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch after a successful upgrade', async () => {
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    expect(await loader.observe(withGlyph)).toBe(true);
    expect(await loader.observe(withGlyph)).toBe(false);
  });

  it('surfaces a fetch failure as the error status and does not retry', async () => {
    const fonts: FontSource = {
      manifest: vi.fn(async () => {
        throw new Error('offline');
      }),
      face: vi.fn(),
    };
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts,
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    expect(await loader.observe(withGlyph)).toBe(false);
    expect(loader.status).toBe('error');
    expect(loader.error).toBe('offline');
    expect(await loader.observe(withGlyph)).toBe(false);
  });

  it('stringifies a non-Error rejection', async () => {
    const fonts: FontSource = {
      manifest: vi.fn(async () => {
        throw 'boom';
      }),
      face: vi.fn(),
    };
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts,
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    expect(await loader.observe(withGlyph)).toBe(false);
    expect(loader.error).toBe('boom');
  });
});

describe('createLazyFontTransport', () => {
  const outcome = (diagnostics: Diagnostics): RenderOutcome => ({
    ok: true,
    pages: [],
    inspect: null,
    diagnostics,
  });

  function fakeInner(diagnostics: Diagnostics): EngineTransport {
    return {
      validate: vi.fn(async () => clean),
      renderRaw: vi.fn(async () => outcome(diagnostics)),
    };
  }

  it('forwards validate to the inner transport', async () => {
    const inner = fakeInner(clean);
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => [],
      absentPackIds: [],
    });
    const transport = createLazyFontTransport({ inner, loader, onUpgraded: vi.fn() });
    await transport.validate('t', 'p', 'd');
    expect(inner.validate).toHaveBeenCalledWith('t', 'p', 'd');
  });

  it('returns the inner render and calls onUpgraded once fonts load', async () => {
    const inner = fakeInner(withGlyph);
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    const onUpgraded = vi.fn();
    const transport = createLazyFontTransport({ inner, loader, onUpgraded });
    const result = await transport.renderRaw('t', 'p', undefined, { scale: 2 });
    expect(result.diagnostics).toBe(withGlyph);
    await vi.waitFor(() => expect(onUpgraded).toHaveBeenCalledTimes(1));
  });

  it('does not call onUpgraded when nothing upgrades', async () => {
    const inner = fakeInner(clean);
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => [],
      absentPackIds: [],
    });
    const onUpgraded = vi.fn();
    const transport = createLazyFontTransport({ inner, loader, onUpgraded });
    await transport.renderRaw('t', 'p', undefined, { scale: 2 });
    await Promise.resolve();
    expect(onUpgraded).not.toHaveBeenCalled();
  });
});

describe('the PDF path waits for the full font set', () => {
  const okRender = (): RenderOutcome => ({
    ok: true,
    pages: [],
    inspect: null,
    diagnostics: clean,
  });

  function pdfInner(): EngineTransport {
    return {
      validate: vi.fn(async () => clean),
      renderRaw: vi.fn(async () => okRender()),
      renderPdf: vi.fn(async () => ({
        ok: true,
        pdf: new Uint8Array([1]),
        diagnostics: clean,
      })),
    };
  }

  it('is absent when the inner transport cannot render PDFs', () => {
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => [],
      absentPackIds: [],
    });
    const transport = createLazyFontTransport({
      inner: { validate: vi.fn(async () => clean), renderRaw: vi.fn(async () => okRender()) },
      loader,
      onUpgraded: vi.fn(),
    });
    expect(transport.renderPdf).toBeUndefined();
  });

  it('loads the absent packs BEFORE rendering, without waiting for a diagnostic', async () => {
    const engine = fakeEngine();
    const loader = new LazyFontLoader({
      engine,
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    const inner = pdfInner();
    const onUpgraded = vi.fn();
    const transport = createLazyFontTransport({ inner, loader, onUpgraded });

    const result = await transport.renderPdf?.('t', 'p', undefined);

    // The store was rebuilt (a deliverable must never carry fallback glyphs),
    // and only then was the PDF rendered.
    expect(engine.subsetCalls).toBe(1);
    expect(loader.status).toBe('upgraded');
    expect(onUpgraded).toHaveBeenCalledTimes(1);
    expect(inner.renderPdf).toHaveBeenCalledWith('t', 'p', undefined);
    expect(result?.ok).toBe(true);
  });

  it('does not re-fetch when everything is already loaded', async () => {
    const engine = fakeEngine();
    const loader = new LazyFontLoader({
      engine,
      fonts: fakeFonts(),
      packIds: () => ['ja'],
      absentPackIds: [],
    });
    const onUpgraded = vi.fn();
    const transport = createLazyFontTransport({ inner: pdfInner(), loader, onUpgraded });
    await transport.renderPdf?.('t', 'p', undefined);
    expect(engine.subsetCalls).toBe(0);
    expect(onUpgraded).not.toHaveBeenCalled();
  });

  it('is single-flight across concurrent PDF requests', async () => {
    const engine = fakeEngine();
    const loader = new LazyFontLoader({
      engine,
      fonts: fakeFonts(),
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    const transport = createLazyFontTransport({
      inner: pdfInner(),
      loader,
      onUpgraded: vi.fn(),
    });
    await Promise.all([
      transport.renderPdf?.('t', 'p', undefined),
      transport.renderPdf?.('t', 'p', undefined),
    ]);
    expect(engine.subsetCalls).toBe(1);
  });

  it('refuses the PDF when the font load fails, then retries on the next ask', async () => {
    // A degraded deliverable is worse than no deliverable: with the load
    // failed, rendering anyway would embed fallback glyphs and silently break
    // the byte-parity with the CLI (which also fails on a pack it cannot
    // load). The refusal is a TransportError the Designer shows as its
    // failed notice; the NEXT ask retries, because the user asked again.
    let fail = true;
    const loader = new LazyFontLoader({
      engine: fakeEngine(),
      fonts: {
        manifest: async (id: string) => {
          if (fail) {
            throw new Error('offline');
          }
          return `id: ${id}`;
        },
        face: async () => new Uint8Array(),
      },
      packIds: () => ['ipamj-mincho'],
      absentPackIds: ['ipamj-mincho'],
    });
    const inner = pdfInner();
    const transport = createLazyFontTransport({ inner, loader, onUpgraded: vi.fn() });

    const refused = await transport.renderPdf?.('t', 'p', undefined).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(TransportError);
    expect((refused as TransportError).message).toContain('offline');
    expect(loader.status).toBe('error');
    // Nothing was rendered with the incomplete store.
    expect(inner.renderPdf).not.toHaveBeenCalled();

    fail = false;
    const outcome = await transport.renderPdf?.('t', 'p', undefined);
    expect(loader.status).toBe('upgraded');
    expect(outcome?.ok).toBe(true);
    expect(inner.renderPdf).toHaveBeenCalledTimes(1);
  });
});

describe('createLazyFontTransport — what it does NOT wrap still passes through', () => {
  const okRender = (): RenderOutcome => ({
    ok: true,
    pages: [],
    inspect: null,
    diagnostics: clean,
  });
  const catalog: FormatCatalog = {
    types: [
      {
        fieldType: 'date',
        fixed: false,
        variants: [
          { spelling: 'default', origin: 'builtin', samples: ['2026-07-05'], dropsTime: false },
        ],
      },
    ],
    probes: [{ sample: '2026', warning: null, refused: null }],
  };

  function idleLoader(): LazyFontLoader {
    return new LazyFontLoader({
      engine: fakeEngine(),
      fonts: fakeFonts(),
      packIds: () => [],
      absentPackIds: [],
    });
  }

  function catalogInner(): EngineTransport {
    return {
      validate: vi.fn(async () => clean),
      renderRaw: vi.fn(async () => okRender()),
      formatCatalog: vi.fn(async (_template: string, _probes: readonly PatternProbe[]) => catalog),
    };
  }

  // The defect this suite exists for: the wrapper enumerated its members, so
  // `formatCatalog` was never forwarded and the standalone app ran with no
  // catalog and no pattern probe at all — every picker lost its samples and the
  // pattern field's chips never appeared. A MISSING optional method leaves no
  // line uncovered, so the 100% gate was green over it for the feature's whole
  // life.
  it('forwards formatCatalog to the inner transport', async () => {
    const inner = catalogInner();
    const transport = createLazyFontTransport({
      inner,
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    const probes: readonly PatternProbe[] = [{ fieldType: 'date', pattern: 'yyyy' }];
    const answer = await transport.formatCatalog?.('t', probes);
    expect(inner.formatCatalog).toHaveBeenCalledWith('t', probes);
    expect(answer?.probes[0].sample).toBe('2026');
  });

  it('is absent when the inner transport cannot answer a format catalog', () => {
    const transport = createLazyFontTransport({
      inner: { validate: vi.fn(async () => clean), renderRaw: vi.fn(async () => okRender()) },
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    expect(transport.formatCatalog).toBeUndefined();
  });

  // Discriminates the EXPLICIT arm from the spread: a spread copies own
  // properties, so a class-shaped host transport — methods on the prototype —
  // is served only by the named delegations. Without the explicit arm this
  // fails while the test above still passes.
  it('forwards a formatCatalog that lives on the inner transport PROTOTYPE', async () => {
    class ClassTransport {
      validate = vi.fn(async () => clean);
      renderRaw = vi.fn(async () => okRender());
      formatCatalog(_template: string, _probes: readonly PatternProbe[]): Promise<FormatCatalog> {
        return Promise.resolve(catalog);
      }
    }
    const inner: EngineTransport = new ClassTransport();
    expect(Object.hasOwn(inner, 'formatCatalog')).toBe(false);
    const transport = createLazyFontTransport({
      inner,
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    const answer = await transport.formatCatalog?.('t', []);
    expect(answer?.types[0].fieldType).toBe('date');
  });

  // Same three-way pin for `localeFacts`, because the same class of defect is
  // available to it: an optional method the wrapper forgets leaves no line
  // uncovered, so the standalone app would simply explain no locale pick with
  // every gate green.
  it('forwards localeFacts to the inner transport', async () => {
    const facts = {
      id: 'ja-JP',
      date: '2026/11/03(\u706b)',
      number: '12,345,678.9',
      currencyDefault: 'JPY',
      amount: '1,234,568',
    };
    const inner: EngineTransport = {
      validate: vi.fn(async () => clean),
      renderRaw: vi.fn(async () => okRender()),
      localeFacts: vi.fn(async () => facts),
    };
    const transport = createLazyFontTransport({
      inner,
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    const answer = await transport.localeFacts?.('t', 'ja-JP', 'id: ja-JP\n');
    expect(inner.localeFacts).toHaveBeenCalledWith('t', 'ja-JP', 'id: ja-JP\n');
    expect(answer?.currencyDefault).toBe('JPY');
  });

  it('is absent when the inner transport cannot answer locale facts', () => {
    const transport = createLazyFontTransport({
      inner: { validate: vi.fn(async () => clean), renderRaw: vi.fn(async () => okRender()) },
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    expect(transport.localeFacts).toBeUndefined();
  });

  it('forwards a localeFacts that lives on the inner transport PROTOTYPE', async () => {
    class ClassTransport {
      validate = vi.fn(async () => clean);
      renderRaw = vi.fn(async () => okRender());
      localeFacts(_t: string, id: string): Promise<LocaleFacts> {
        return Promise.resolve({
          id,
          date: 'd',
          number: 'n',
          currencyDefault: 'JPY',
          amount: 'a',
        });
      }
    }
    const inner: EngineTransport = new ClassTransport();
    expect(Object.hasOwn(inner, 'localeFacts')).toBe(false);
    const transport = createLazyFontTransport({
      inner,
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    expect((await transport.localeFacts?.('t', 'zh-TW'))?.id).toBe('zh-TW');
  });

  // The structural half of the fix, pinned so nobody re-hand-rolls the literal:
  // a member the wrapper knows nothing about rides through. That is what makes
  // the NEXT optional method on `EngineTransport` reach the app without an edit
  // here.
  it('passes through a member the wrapper knows nothing about', async () => {
    const future = vi.fn(async () => 'answered');
    const inner = { ...catalogInner(), future } as unknown as EngineTransport;
    const transport = createLazyFontTransport({
      inner,
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    const reached = (transport as unknown as { future?: () => Promise<string> }).future;
    expect(await reached?.()).toBe('answered');
  });

  // The spread is `CreateDataProperty`, never `[[Set]]`, so an own `__proto__`
  // on a hostile host-injected transport becomes an ordinary own key rather
  // than mutating the wrapper's prototype. The literal form must come from
  // JSON: `{ __proto__: … }` in test SOURCE sets the prototype instead.
  it('does not let a hostile inner transport pollute the prototype', () => {
    const hostile = JSON.parse('{"__proto__":{"polluted":"yes"}}') as Record<string, unknown>;
    const inner = Object.assign(hostile, catalogInner()) as unknown as EngineTransport;
    const transport = createLazyFontTransport({
      inner,
      loader: idleLoader(),
      onUpgraded: vi.fn(),
    });
    expect(transport).toBeDefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(transport)).toBe(Object.prototype);
  });
});
