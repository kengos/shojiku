// The preset loader's ONE decision: which files it asks the server for.
// `src/browser/` is coverage-excluded (it closes over the real `fetch`), but
// the decision is still worth an assertion — the whole point of the catalog
// flag is a request that is NOT made.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../assets/manifest';

const fetchText = vi.fn(async (url: string) => `text:${url}`);
const fetchBytes = vi.fn(async (_url: string) => new Uint8Array());

vi.mock('./io', () => ({
  fetchText: (url: string) => fetchText(url),
  fetchBytes: (url: string) => fetchBytes(url),
}));

const { makeLoadPreset } = await import('./dataSources');

const BASE = 'data/';
const preset = (over: Record<string, unknown> = {}) => ({
  id: 'blank-a4',
  locales: ['ja'],
  engineLocale: 'ja-JP',
  name: { ja: '白紙' },
  thumbnail: 'preview-1.png',
  ...over,
});
const catalog = (over: Record<string, unknown> = {}): Catalog =>
  ({ presets: [preset(over)] }) as Catalog;

beforeEach(() => {
  fetchText.mockClear();
  fetchBytes.mockClear();
});

function askedFor(name: string): boolean {
  return fetchText.mock.calls.some(([url]) => url.endsWith(name));
}

describe('makeLoadPreset', () => {
  it('always asks for the template and the sample data', async () => {
    await makeLoadPreset(catalog(), BASE)('blank-a4');
    expect(askedFor('templates.yml')).toBe(true);
    expect(askedFor('params.json')).toBe(true);
  });

  // The seven BLANK presets carry no definitions — i.e. every first-time
  // start. A `.catch` handles the miss but cannot un-log the browser's own
  // 404, which is what a walkthrough reported as a bug.
  it('does NOT ask for definitions the catalog does not declare', async () => {
    const files = await makeLoadPreset(catalog(), BASE)('blank-a4');
    expect(askedFor('definitions.yml')).toBe(false);
    expect(files.definitions).toBeUndefined();
  });

  it('asks for definitions when the catalog declares them', async () => {
    const files = await makeLoadPreset(catalog({ definitions: true }), BASE)('blank-a4');
    expect(askedFor('definitions.yml')).toBe(true);
    expect(files.definitions).toBe('text:data/presets/blank-a4/definitions.yml');
  });

  // The catalog is fetched at runtime, so a stale one carrying a truthy
  // non-boolean must read as "do not ask".
  it('does not ask on a truthy non-boolean flag', async () => {
    await makeLoadPreset(catalog({ definitions: 'yes' }), BASE)('blank-a4');
    expect(askedFor('definitions.yml')).toBe(false);
  });

  it('refuses an unsafe preset id before composing any URL', async () => {
    await expect(makeLoadPreset(catalog(), BASE)('../etc')).rejects.toThrow(/unsafe preset id/);
    expect(fetchText).not.toHaveBeenCalled();
  });
});
