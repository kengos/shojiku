import { describe, expect, it, vi } from 'vitest';
import { TransportError } from './transport';
import { createWasmTransport, type WasmEngine } from './wasmTransport';

const EMPTY_DIAGNOSTICS = JSON.stringify({ items: [] });
const INSPECT = JSON.stringify({
  engine: { version: '0', capabilities: [], builtinLocales: [] },
  document: null,
  boxes: { pages: [[]] },
  margin: [0, 0, 0, 0],
});

/** A valid raw render object; individual tests override one field to a bad
 * value to exercise one guard branch at a time. */
function validRaw(): Record<string, unknown> {
  return {
    ok: true,
    pages: [{ width: 1, height: 1, rgba: new Uint8Array(4) }],
    inspect: INSPECT,
    diagnostics: EMPTY_DIAGNOSTICS,
  };
}

function engineReturning(raw: unknown): WasmEngine {
  return { validate: () => EMPTY_DIAGNOSTICS, renderRaw: () => raw };
}

/** Assert `renderRaw` rejects with a TransportError whose message includes a
 * fragment — the guard branch under test. */
async function expectRenderReject(raw: unknown, fragment: string): Promise<void> {
  const transport = createWasmTransport(engineReturning(raw));
  await expect(transport.renderRaw('t', 'p', undefined, { scale: 2 })).rejects.toThrow(fragment);
  await expect(transport.renderRaw('t', 'p', undefined, { scale: 2 })).rejects.toBeInstanceOf(
    TransportError,
  );
}

describe('createWasmTransport.renderRaw — happy path', () => {
  it('parses a valid render result into an outcome', async () => {
    const transport = createWasmTransport(engineReturning(validRaw()));
    const outcome = await transport.renderRaw('t', 'p', 'd', { scale: 2 });
    expect(outcome.ok).toBe(true);
    expect(outcome.pages).toHaveLength(1);
    expect(outcome.pages[0].width).toBe(1);
    expect(outcome.pages[0].rgba).toBeInstanceOf(Uint8Array);
    expect(outcome.inspect?.boxes.pages).toHaveLength(1);
    expect(outcome.diagnostics.items).toHaveLength(0);
  });

  it('maps a null inspect (parse/validate failure) to a null envelope', async () => {
    const transport = createWasmTransport(
      engineReturning({ ok: false, pages: [], inspect: null, diagnostics: EMPTY_DIAGNOSTICS }),
    );
    const outcome = await transport.renderRaw('t', 'p', undefined, { scale: 2 });
    expect(outcome.ok).toBe(false);
    expect(outcome.inspect).toBeNull();
  });

  it('forwards the page index and null definitions to the engine', async () => {
    const renderRaw = vi.fn().mockReturnValue(validRaw());
    const transport = createWasmTransport({ validate: () => EMPTY_DIAGNOSTICS, renderRaw });
    await transport.renderRaw('t', 'p', undefined, { scale: 3, pageIndex: 1 });
    expect(renderRaw).toHaveBeenCalledWith('t', 'p', null, 3, 1);
  });
});

describe('createWasmTransport.renderRaw — response guards', () => {
  it('rejects a non-object result', () => expectRenderReject(42, 'render result'));
  it('rejects a non-boolean ok', () => expectRenderReject({ ...validRaw(), ok: 'x' }, 'ok'));
  it('rejects non-array pages', () => expectRenderReject({ ...validRaw(), pages: 'x' }, 'pages'));
  it('rejects a non-object page', () =>
    expectRenderReject({ ...validRaw(), pages: [5] }, 'pages[0]'));
  it('rejects a non-number width', () =>
    expectRenderReject(
      { ...validRaw(), pages: [{ width: 'x', height: 1, rgba: new Uint8Array(4) }] },
      'width',
    ));
  it('rejects a non-number height', () =>
    expectRenderReject(
      { ...validRaw(), pages: [{ width: 1, height: 'x', rgba: new Uint8Array(4) }] },
      'height',
    ));
  it('rejects a fractional width even when the area check would pass', () =>
    // 2.5 * 1.6 * 4 = 16 = rgba length — only the integer guard catches it.
    expectRenderReject(
      { ...validRaw(), pages: [{ width: 2.5, height: 1.6, rgba: new Uint8Array(16) }] },
      'positive integer',
    ));
  it('rejects a non-positive height', () =>
    expectRenderReject(
      { ...validRaw(), pages: [{ width: 1, height: 0, rgba: new Uint8Array(0) }] },
      'positive integer',
    ));
  it('rejects a non-Uint8Array rgba', () =>
    expectRenderReject(
      { ...validRaw(), pages: [{ width: 1, height: 1, rgba: [] }] },
      'expected a Uint8Array',
    ));
  it('rejects a mismatched rgba length', () =>
    expectRenderReject(
      { ...validRaw(), pages: [{ width: 2, height: 1, rgba: new Uint8Array(4) }] },
      '!= 8',
    ));
  it('rejects a non-string inspect', () =>
    expectRenderReject({ ...validRaw(), inspect: 42 }, 'inspect: expected a string'));
  it('rejects malformed inspect JSON', () =>
    expectRenderReject({ ...validRaw(), inspect: 'not json' }, 'inspect: malformed JSON'));
  it('rejects a non-string diagnostics', () =>
    expectRenderReject({ ...validRaw(), diagnostics: 42 }, 'diagnostics: expected a string'));
  it('rejects malformed diagnostics JSON', () =>
    expectRenderReject({ ...validRaw(), diagnostics: 'nope' }, 'diagnostics: malformed JSON'));
  it('rejects a non-object diagnostics payload', () =>
    expectRenderReject({ ...validRaw(), diagnostics: 'null' }, 'diagnostics: expected an object'));
  it('rejects a non-array diagnostics.items', () =>
    expectRenderReject({ ...validRaw(), diagnostics: '{"items":5}' }, 'diagnostics.items'));
});

describe('createWasmTransport — engine throws', () => {
  it('wraps a renderRaw host-misuse throw as a TransportError', async () => {
    const engine: WasmEngine = {
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => {
        throw 'fonts not loaded; call load_fonts first';
      },
    };
    const transport = createWasmTransport(engine);
    await expect(transport.renderRaw('t', 'p', undefined, { scale: 2 })).rejects.toThrow(
      'fonts not loaded',
    );
  });

  it('wraps a validate throw as a TransportError', async () => {
    const engine: WasmEngine = {
      validate: () => {
        throw new Error('bad');
      },
      renderRaw: () => validRaw(),
    };
    const transport = createWasmTransport(engine);
    await expect(transport.validate('t')).rejects.toBeInstanceOf(TransportError);
  });

  it('carries the engine error code and args through to the TransportError', async () => {
    const typed = Object.assign(new Error('page 9 is out of range'), {
      code: 'page_out_of_range',
      args: { page: 9, total: 2 },
    });
    const engine: WasmEngine = {
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => {
        throw typed;
      },
    };
    const transport = createWasmTransport(engine);
    const error = await transport
      .renderRaw('t', 'p', undefined, { scale: 2 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).code).toBe('page_out_of_range');
    expect((error as TransportError).args).toEqual({ page: 9, total: 2 });
  });

  it('leaves code and args undefined for a bare-string throw (older engine)', async () => {
    const engine: WasmEngine = {
      validate: () => {
        throw 'boom';
      },
      renderRaw: () => validRaw(),
    };
    const transport = createWasmTransport(engine);
    const error = await transport.validate('t').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).code).toBeUndefined();
    expect((error as TransportError).args).toBeUndefined();
  });
});

describe('createWasmTransport.validate — happy path', () => {
  it('parses the diagnostics JSON and passes null for omitted args', async () => {
    const validate = vi.fn().mockReturnValue(JSON.stringify({ items: [{ severity: 'info' }] }));
    const transport = createWasmTransport({ validate, renderRaw: () => validRaw() });
    const diags = await transport.validate('t');
    expect(validate).toHaveBeenCalledWith('t', null, null);
    expect(diags.items).toHaveLength(1);
  });
});

describe('createWasmTransport.renderPdf', () => {
  const validPdf = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    ok: true,
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    diagnostics: EMPTY_DIAGNOSTICS,
    ...over,
  });

  it('is absent when the engine has no renderPdf (an older module)', () => {
    const transport = createWasmTransport({
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => validRaw(),
    });
    expect(transport.renderPdf).toBeUndefined();
  });

  it('passes the sources through and returns the bytes with diagnostics', async () => {
    const renderPdf = vi.fn().mockReturnValue(validPdf());
    const transport = createWasmTransport({
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => validRaw(),
      renderPdf,
    });
    const outcome = await transport.renderPdf?.('t', 'p', undefined);
    expect(renderPdf).toHaveBeenCalledWith('t', 'p', null);
    expect(outcome?.ok).toBe(true);
    expect(outcome?.pdf).toHaveLength(4);
    expect(outcome?.diagnostics.items).toEqual([]);
  });

  it('carries a document error through as ok:false with empty bytes', async () => {
    const transport = createWasmTransport({
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => validRaw(),
      renderPdf: () => validPdf({ ok: false, pdf: new Uint8Array() }),
    });
    const outcome = await transport.renderPdf?.('t', 'p', 'd');
    expect(outcome?.ok).toBe(false);
    expect(outcome?.pdf).toHaveLength(0);
  });

  it.each([
    ['a non-object response', 'nope' as unknown, 'pdf result'],
    ['a non-boolean ok', validPdf({ ok: 'yes' }), 'ok'],
    ['non-bytes', validPdf({ pdf: 'not bytes' }), 'expected a Uint8Array'],
    ['an ok render with no bytes', validPdf({ pdf: new Uint8Array() }), 'produced no bytes'],
    ['non-string diagnostics', validPdf({ diagnostics: 7 }), 'diagnostics'],
  ])('rejects %s with a TransportError', async (_name, raw, fragment) => {
    const transport = createWasmTransport({
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => validRaw(),
      renderPdf: () => raw,
    });
    const error = await transport.renderPdf?.('t', 'p', undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).message).toContain(fragment);
  });

  it('maps a typed engine throw to a TransportError carrying code and args', async () => {
    const thrown = Object.assign(new Error('fonts are not loaded'), {
      code: 'fonts_not_loaded',
      args: {},
    });
    const transport = createWasmTransport({
      validate: () => EMPTY_DIAGNOSTICS,
      renderRaw: () => validRaw(),
      renderPdf: () => {
        throw thrown;
      },
    });
    const error = await transport.renderPdf?.('t', 'p', undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect((error as TransportError).code).toBe('fonts_not_loaded');
  });
});

const CATALOG_JSON = JSON.stringify({
  types: [
    {
      fieldType: 'date',
      fixed: false,
      variants: [
        { spelling: 'wareki', origin: 'pack', samples: ['令和8年11月3日'], dropsTime: false },
      ],
    },
  ],
  probes: [{ sample: '2026.11.03', warning: null, refused: null }],
});

describe('createWasmTransport.formatCatalog', () => {
  it('is ABSENT when the engine has no such method', () => {
    // The feature gate the Designer reads is presence, never a version sniff —
    // the same rule `renderPdf` already follows.
    const transport = createWasmTransport(engineReturning(validRaw()));
    expect(transport.formatCatalog).toBeUndefined();
  });

  it('is present when the engine exposes it, and parses the answer', async () => {
    const engine: WasmEngine = {
      ...engineReturning(validRaw()),
      formatCatalog: () => CATALOG_JSON,
    };
    const transport = createWasmTransport(engine);
    const catalog = await transport.formatCatalog?.('t', []);
    expect(catalog?.types[0].variants[0].samples).toEqual(['令和8年11月3日']);
    expect(catalog?.probes[0].sample).toBe('2026.11.03');
  });

  it('hands the probes to the engine as JSON', async () => {
    // The engine parses them, so the accepted shapes are decided in ONE place
    // rather than mirrored on this side.
    const formatCatalog = vi.fn(() => CATALOG_JSON);
    const transport = createWasmTransport({ ...engineReturning(validRaw()), formatCatalog });
    await transport.formatCatalog?.('the template', [{ fieldType: 'date', pattern: 'yyyy' }]);
    expect(formatCatalog).toHaveBeenCalledWith(
      'the template',
      JSON.stringify([{ fieldType: 'date', pattern: 'yyyy' }]),
    );
  });

  it('turns an engine throw into a TransportError carrying its typed code', async () => {
    const engine: WasmEngine = {
      ...engineReturning(validRaw()),
      formatCatalog: () => {
        throw Object.assign(new Error('no locale set'), { code: 'locale_not_set', args: {} });
      },
    };
    const transport = createWasmTransport(engine);
    await expect(transport.formatCatalog?.('t', [])).rejects.toBeInstanceOf(TransportError);
    await expect(transport.formatCatalog?.('t', [])).rejects.toMatchObject({
      code: 'locale_not_set',
    });
  });

  it('turns a malformed answer into a TransportError', async () => {
    const engine: WasmEngine = {
      ...engineReturning(validRaw()),
      formatCatalog: () => '{"types":"nope","probes":[]}',
    };
    const transport = createWasmTransport(engine);
    await expect(transport.formatCatalog?.('t', [])).rejects.toBeInstanceOf(TransportError);
  });
});

const FACTS_JSON = JSON.stringify({
  id: 'th-TH',
  date: '3 \u0e1e.\u0e22. 2569',
  number: '12,345,678.9',
  currencyDefault: 'THB',
  amount: '1,234,567.89',
});

describe('createWasmTransport.localeFacts', () => {
  it('is ABSENT when the engine has no such method', () => {
    // Presence, never a version sniff — the panel explains nothing against an
    // engine without the `locale.facts` query.
    expect(createWasmTransport(engineReturning(validRaw())).localeFacts).toBeUndefined();
  });

  it('hands the tag and the pack text to the engine and parses the answer', async () => {
    const localeFacts = vi.fn(() => FACTS_JSON);
    const transport = createWasmTransport({ ...engineReturning(validRaw()), localeFacts });
    const facts = await transport.localeFacts?.('the template', 'th-TH', 'id: th-TH\n');
    expect(localeFacts).toHaveBeenCalledWith('the template', 'th-TH', 'id: th-TH\n');
    expect(facts?.date).toContain('2569');
  });

  it('sends null for a builtin locale, which needs no pack', async () => {
    const localeFacts = vi.fn(() => FACTS_JSON);
    const transport = createWasmTransport({ ...engineReturning(validRaw()), localeFacts });
    await transport.localeFacts?.('t', 'ja-JP');
    expect(localeFacts).toHaveBeenCalledWith('t', 'ja-JP', null);
  });

  it('turns an engine throw into a TransportError carrying its typed code', async () => {
    const engine: WasmEngine = {
      ...engineReturning(validRaw()),
      localeFacts: () => {
        throw Object.assign(new Error('locale error: nope'), {
          code: 'locale_error',
          args: { detail: 'nope' },
        });
      },
    };
    const transport = createWasmTransport(engine);
    await expect(transport.localeFacts?.('t', 'zz-ZZ')).rejects.toBeInstanceOf(TransportError);
    // `args` is the load-bearing half HERE, unlike on the catalog: `detail`
    // is where the engine's clipped, control-stripped echo of a hostile
    // `defaults.locale` arrives, and the engine-side test proves the clip
    // only up to the wasm boundary. This pins that it crosses intact.
    await expect(transport.localeFacts?.('t', 'zz-ZZ')).rejects.toMatchObject({
      code: 'locale_error',
      args: { detail: 'nope' },
    });
  });

  it('turns a malformed answer into a TransportError', async () => {
    const engine: WasmEngine = {
      ...engineReturning(validRaw()),
      localeFacts: () => '{"id":7}',
    };
    await expect(createWasmTransport(engine).localeFacts?.('t', 'ja-JP')).rejects.toBeInstanceOf(
      TransportError,
    );
  });
});
