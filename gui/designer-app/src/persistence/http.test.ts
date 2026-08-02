// Tests for http.ts — the mounted host's client (routes, fail-closed typed
// outcomes, 409 conflict). httpReaders.ts (the per-payload response readers,
// body/list caps) has no separate public surface and is pinned HERE through
// the load/list/save suites' malformed-response cases.
import { MAX_NAME_CHARS } from '@shojiku/designer';
import { describe, expect, it, vi } from 'vitest';
import type { InstalledFont } from '../fonts/library';
import { type HttpFetch, type HttpResponse, HttpStore, HttpStoreError } from './http';
import { docKey } from './httpIds';
import { MAX_LIST_ENTRIES, MAX_RESPONSE_CHARS } from './httpReaders';

const BASE = 'https://host.example/admin/designer/api/';

const lato: InstalledFont = {
  packId: 'gf-lato',
  familyId: 'gf-lato',
  displayName: 'Lato',
  manifest: 'version: 1\n',
  licenseFile: 'OFL.txt',
  licenseText: 'Copyright (c) Lato',
};

function response(status: number, body: string): HttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

/** A fake fetch answering from a url → response table; unknown urls 404. */
function fakeFetch(routes: Record<string, HttpResponse>): HttpFetch {
  return async (url) => routes[url] ?? response(404, '');
}

function store(routes: Record<string, HttpResponse>): HttpStore {
  return new HttpStore({ fetch: fakeFetch(routes), base: BASE });
}

describe('HttpStore.listProjects', () => {
  it('returns validated summaries and clips long names', async () => {
    const projects = [
      { id: 'invoices', name: 'Invoices' },
      { id: 'slips', name: 'y'.repeat(200) },
    ];
    const list = await store({
      [`${BASE}projects`]: response(200, JSON.stringify({ projects })),
    }).listProjects();
    expect(list[0]).toEqual({ id: 'invoices', name: 'Invoices' });
    expect(list[1].name).toHaveLength(MAX_NAME_CHARS);
  });

  it('throws a typed error on a non-2xx status', async () => {
    await expect(store({}).listProjects()).rejects.toBeInstanceOf(HttpStoreError);
  });

  it.each([
    ['non-JSON', response(200, 'not json')],
    ['non-object body', response(200, '[]')],
    ['missing projects', response(200, '{}')],
    ['unsafe id', response(200, JSON.stringify({ projects: [{ id: '../up', name: 'x' }] }))],
    ['non-string name', response(200, JSON.stringify({ projects: [{ id: 'p', name: 7 }] }))],
    ['non-object entry', response(200, JSON.stringify({ projects: ['p'] }))],
  ])('rejects a malformed list body (%s)', async (_label, res) => {
    await expect(store({ [`${BASE}projects`]: res }).listProjects()).rejects.toBeInstanceOf(
      HttpStoreError,
    );
  });

  it('rejects an oversized response without parsing it', async () => {
    const huge = `{"projects": [${'"x",'.repeat(MAX_RESPONSE_CHARS / 4)}]}`;
    await expect(
      store({ [`${BASE}projects`]: response(200, huge) }).listProjects(),
    ).rejects.toBeInstanceOf(HttpStoreError);
  });

  it('rejects an over-long project list', async () => {
    const projects = Array.from({ length: MAX_LIST_ENTRIES + 1 }, (_, i) => ({
      id: `p${i}`,
      name: 'x',
    }));
    await expect(
      store({ [`${BASE}projects`]: response(200, JSON.stringify({ projects })) }).listProjects(),
    ).rejects.toBeInstanceOf(HttpStoreError);
  });
});

describe('HttpStore.loadProject', () => {
  const url = `${BASE}projects/invoices`;

  it('returns a validated project with definitions and template entries', async () => {
    const body = {
      id: 'invoices',
      name: 'Invoices',
      definitions: 'version: "0.1.0"\n',
      templates: [{ id: 'monthly', name: 'Monthly', engineLocale: 'ja-JP' }],
    };
    const project = await store({ [url]: response(200, JSON.stringify(body)) }).loadProject(
      'invoices',
    );
    expect(project).toEqual(body);
  });

  it('accepts a project without definitions or engineLocale', async () => {
    const body = { id: 'invoices', name: 'Invoices', templates: [{ id: 't', name: 'T' }] };
    const project = await store({ [url]: response(200, JSON.stringify(body)) }).loadProject(
      'invoices',
    );
    expect(project.definitions).toBeUndefined();
    expect(project.definitionsRev).toBeUndefined();
    expect(project.templates[0].engineLocale).toBeUndefined();
  });

  it('carries the definitions concurrency token when present', async () => {
    const body = {
      id: 'invoices',
      name: 'Invoices',
      definitions: 'version: "0.1.0"\n',
      definitionsRev: 'd7',
      templates: [{ id: 't', name: 'T' }],
    };
    const project = await store({ [url]: response(200, JSON.stringify(body)) }).loadProject(
      'invoices',
    );
    expect(project.definitionsRev).toBe('d7');
  });

  it('rejects a hostile project id before any fetch happens', async () => {
    const fetchFn = vi.fn<HttpFetch>();
    const hostile = new HttpStore({ fetch: fetchFn, base: BASE });
    for (const id of ['../secrets', 'a/b', '', '__proto__/x']) {
      await expect(hostile.loadProject(id)).rejects.toBeInstanceOf(HttpStoreError);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a non-object project body', async () => {
    await expect(
      store({ [url]: response(200, '[]') }).loadProject('invoices'),
    ).rejects.toBeInstanceOf(HttpStoreError);
  });

  it.each([
    ['id mismatch shape', { id: 7, name: 'x', templates: [] }],
    ['non-object template entry', { id: 'invoices', name: 'x', templates: ['t'] }],
    ['non-string definitions', { id: 'invoices', name: 'x', definitions: 7, templates: [] }],
    ['non-string definitionsRev', { id: 'invoices', name: 'x', definitionsRev: 7, templates: [] }],
    ['missing templates', { id: 'invoices', name: 'x' }],
    ['unsafe template id', { id: 'invoices', name: 'x', templates: [{ id: 'a/b', name: 'y' }] }],
    [
      'unsafe engineLocale',
      { id: 'invoices', name: 'x', templates: [{ id: 't', name: 'y', engineLocale: 'ja/JP' }] },
    ],
  ])('rejects a malformed project body (%s)', async (_label, body) => {
    await expect(
      store({ [url]: response(200, JSON.stringify(body)) }).loadProject('invoices'),
    ).rejects.toBeInstanceOf(HttpStoreError);
  });

  it('rejects an over-long template list', async () => {
    const templates = Array.from({ length: MAX_LIST_ENTRIES + 1 }, (_, i) => ({
      id: `t${i}`,
      name: 'x',
    }));
    await expect(
      store({
        [url]: response(200, JSON.stringify({ id: 'invoices', name: 'x', templates })),
      }).loadProject('invoices'),
    ).rejects.toBeInstanceOf(HttpStoreError);
  });
});

describe('HttpStore.load', () => {
  const url = `${BASE}projects/invoices/templates/monthly`;
  const KEY = docKey('invoices', 'monthly');

  it('returns the document with fonts, rev, and params', async () => {
    const body = { source: 'version: "0.1.0"\n', params: '{}', fonts: [lato], rev: 'r1' };
    const doc = await store({ [url]: response(200, JSON.stringify(body)) }).load(KEY);
    expect(doc).toEqual({ text: body.source, fonts: [lato], rev: 'r1', params: '{}' });
  });

  it('defaults absent fonts to an empty list', async () => {
    const doc = await store({ [url]: response(200, JSON.stringify({ source: 'x' })) }).load(KEY);
    expect(doc).toEqual({ text: 'x', fonts: [], rev: undefined, params: undefined });
  });

  it('resolves null on a malformed key, without fetching', async () => {
    const fetchFn = vi.fn<HttpFetch>();
    const hostile = new HttpStore({ fetch: fetchFn, base: BASE });
    for (const key of ['plain', 'a/b/c', '../x/y', 'invoices/../../etc']) {
      expect(await hostile.load(key)).toBeNull();
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['missing source', {}],
    ['non-string source', { source: 7 }],
    ['non-string params', { source: 'x', params: 7 }],
    ['non-string rev', { source: 'x', rev: 7 }],
    ['malformed font entry', { source: 'x', fonts: [{ packId: 1 }] }],
    ['non-array fonts', { source: 'x', fonts: 'gf-lato' }],
  ])('resolves null on a malformed document (%s)', async (_label, body) => {
    expect(await store({ [url]: response(200, JSON.stringify(body)) }).load(KEY)).toBeNull();
  });

  it('resolves null on a 404', async () => {
    expect(await store({}).load(KEY)).toBeNull();
  });

  it('rejects an over-long font list', async () => {
    const fonts = Array.from({ length: MAX_LIST_ENTRIES + 1 }, () => lato);
    expect(
      await store({ [url]: response(200, JSON.stringify({ source: 'x', fonts })) }).load(KEY),
    ).toBeNull();
  });
});

describe('HttpStore.save', () => {
  const url = `${BASE}projects/invoices/templates/monthly`;
  const KEY = docKey('invoices', 'monthly');

  it('PUTs the document as the wire shape and returns the new rev', async () => {
    const fetchFn = vi.fn<HttpFetch>(async () => response(200, JSON.stringify({ rev: 'r2' })));
    const outcome = await new HttpStore({ fetch: fetchFn, base: BASE }).save(KEY, {
      text: 'version: "0.1.0"\n',
      fonts: [lato],
      rev: 'r1',
    });
    expect(outcome).toEqual({ ok: true, rev: 'r2' });
    const [calledUrl, init] = fetchFn.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init?.method).toBe('PUT');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(init?.body as string)).toEqual({
      source: 'version: "0.1.0"\n',
      fonts: [lato],
      rev: 'r1',
    });
  });

  it('omits rev from the wire when the document has none, and accepts an empty response', async () => {
    const fetchFn = vi.fn<HttpFetch>(async () => response(200, ''));
    const outcome = await new HttpStore({ fetch: fetchFn, base: BASE }).save(KEY, {
      text: 'x',
      fonts: [],
    });
    expect(outcome).toEqual({ ok: true, rev: undefined });
    expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toEqual({
      source: 'x',
      fonts: [],
    });
  });

  it('carries the header rename in the PUT body when the document has one', async () => {
    const fetchFn = vi.fn<HttpFetch>(async () => response(200, ''));
    await new HttpStore({ fetch: fetchFn, base: BASE }).save(KEY, {
      text: 'x',
      fonts: [],
      rev: 'r1',
      name: 'My invoice',
    });
    // The name is composed via JSON.stringify (never string-built), read back
    // by parsing the recorded body.
    expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toEqual({
      source: 'x',
      fonts: [],
      rev: 'r1',
      name: 'My invoice',
    });
  });

  it('omits the name key entirely when the document was never renamed', async () => {
    const fetchFn = vi.fn<HttpFetch>(async () => response(200, ''));
    await new HttpStore({ fetch: fetchFn, base: BASE }).save(KEY, { text: 'x', fonts: [] });
    expect('name' in JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toBe(false);
  });

  it('ignores a malformed success body (save still succeeded)', async () => {
    const outcome = await store({ [url]: response(200, 'not json') }).save(KEY, {
      text: 'x',
      fonts: [],
    });
    expect(outcome).toEqual({ ok: true, rev: undefined });
  });

  it('maps 409 to a conflict and other failures to errors', async () => {
    expect(await store({ [url]: response(409, '') }).save(KEY, { text: 'x', fonts: [] })).toEqual({
      ok: false,
      kind: 'conflict',
    });
    expect(await store({ [url]: response(500, '') }).save(KEY, { text: 'x', fonts: [] })).toEqual({
      ok: false,
      kind: 'error',
    });
  });

  it('maps a network throw to a typed error', async () => {
    const failing = new HttpStore({
      fetch: async () => {
        throw new Error('offline');
      },
      base: BASE,
    });
    expect(await failing.save(KEY, { text: 'x', fonts: [] })).toEqual({
      ok: false,
      kind: 'error',
    });
  });

  it('fails a malformed key without fetching', async () => {
    const fetchFn = vi.fn<HttpFetch>();
    const outcome = await new HttpStore({ fetch: fetchFn, base: BASE }).save('a/b/c', {
      text: 'x',
      fonts: [],
    });
    expect(outcome).toEqual({ ok: false, kind: 'error' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('HttpStore.saveDefinitions', () => {
  const url = `${BASE}projects/invoices/definitions`;

  it('PUTs the definitions doc and adopts the new rev', async () => {
    const fetchFn = vi.fn<HttpFetch>(async () => response(200, JSON.stringify({ rev: 'd2' })));
    const outcome = await new HttpStore({ fetch: fetchFn, base: BASE }).saveDefinitions(
      'invoices',
      {
        definitions: 'type: object\n',
        rev: 'd1',
      },
    );
    expect(outcome).toEqual({ ok: true, rev: 'd2' });
    const [calledUrl, init] = fetchFn.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init?.method).toBe('PUT');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(init?.body as string)).toEqual({ definitions: 'type: object\n', rev: 'd1' });
  });

  it('omits rev when absent and accepts an empty response', async () => {
    const fetchFn = vi.fn<HttpFetch>(async () => response(200, ''));
    const outcome = await new HttpStore({ fetch: fetchFn, base: BASE }).saveDefinitions(
      'invoices',
      {
        definitions: 'type: object\n',
      },
    );
    expect(outcome).toEqual({ ok: true, rev: undefined });
    expect('rev' in JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toBe(false);
  });

  it('maps 409 to a conflict and other failures to errors', async () => {
    expect(
      await store({ [url]: response(409, '') }).saveDefinitions('invoices', { definitions: 'x' }),
    ).toEqual({ ok: false, kind: 'conflict' });
    expect(
      await store({ [url]: response(500, '') }).saveDefinitions('invoices', { definitions: 'x' }),
    ).toEqual({ ok: false, kind: 'error' });
  });

  it('maps a network throw to a typed error', async () => {
    const failing = new HttpStore({
      fetch: async () => {
        throw new Error('offline');
      },
      base: BASE,
    });
    expect(await failing.saveDefinitions('invoices', { definitions: 'x' })).toEqual({
      ok: false,
      kind: 'error',
    });
  });

  it('fails a hostile project id without fetching', async () => {
    const fetchFn = vi.fn<HttpFetch>();
    const outcome = await new HttpStore({ fetch: fetchFn, base: BASE }).saveDefinitions(
      '../secrets',
      { definitions: 'x' },
    );
    expect(outcome).toEqual({ ok: false, kind: 'error' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
