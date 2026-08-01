import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_ORIGIN,
  FontFetchError,
  isAllowedUrl,
  MAX_FACE_BYTES,
  makeGoogleFontSource,
} from './source';

function response(body: Uint8Array | string, init: { status?: number; length?: string } = {}) {
  const headers = new Headers();
  if (init.length !== undefined) {
    headers.set('content-length', init.length);
  }
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers,
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  } as unknown as Response;
}

describe('isAllowedUrl', () => {
  it('accepts the allowed origin over https', () => {
    expect(isAllowedUrl(`${ALLOWED_ORIGIN}/google/fonts/abc/ofl/lato/Lato-Regular.ttf`)).toBe(true);
  });

  it('rejects a look-alike host that a prefix check would pass', () => {
    // The whole reason this parses rather than string-matches.
    expect(isAllowedUrl('https://raw.githubusercontent.com.evil.test/x.ttf')).toBe(false);
    expect(isAllowedUrl('https://evil.test/raw.githubusercontent.com/x.ttf')).toBe(false);
  });

  it('rejects plaintext, other origins, and embedded credentials', () => {
    expect(isAllowedUrl('http://raw.githubusercontent.com/x.ttf')).toBe(false);
    expect(isAllowedUrl('https://fonts.gstatic.com/s/lato/v1/x.ttf')).toBe(false);
    expect(isAllowedUrl('https://user:pw@raw.githubusercontent.com/x.ttf')).toBe(false);
  });

  it('rejects a non-URL without throwing', () => {
    expect(isAllowedUrl('not a url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });
});

describe('makeGoogleFontSource', () => {
  const url = `${ALLOWED_ORIGIN}/google/fonts/abc/ofl/lato/Lato-Regular.ttf`;

  it('fetches face bytes from an allowed URL, refusing redirects', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(new Uint8Array([1, 2, 3])));
    const source = makeGoogleFontSource(fetchFn as unknown as typeof fetch);
    await expect(source.face(url)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    // A hop could leave the origin the allowlist checked.
    expect(fetchFn).toHaveBeenCalledWith(url, { redirect: 'error' });
  });

  it('decodes licence text', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response('Copyright (c) Lato'));
    const source = makeGoogleFontSource(fetchFn as unknown as typeof fetch);
    await expect(source.license(url)).resolves.toBe('Copyright (c) Lato');
  });

  it('makes NO request for a URL off the allowlist', async () => {
    // A pin arrives from a persisted draft, which is user-writable storage.
    const fetchFn = vi.fn();
    const source = makeGoogleFontSource(fetchFn as unknown as typeof fetch);
    await expect(source.face('https://evil.test/x.ttf')).rejects.toThrow(FontFetchError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects an over-cap declared length before reading the body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(response(new Uint8Array([1]), { length: String(MAX_FACE_BYTES + 1) }));
    const source = makeGoogleFontSource(fetchFn as unknown as typeof fetch);
    await expect(source.face(url)).rejects.toThrow(/size cap/);
  });

  it('rejects an over-cap body whose declared length lied', async () => {
    const source = makeGoogleFontSource(
      vi.fn().mockResolvedValue(response('x'.repeat(300 * 1024))) as unknown as typeof fetch,
    );
    // The licence cap is 256 KiB; the header claimed nothing.
    await expect(source.license(url)).rejects.toThrow(/size cap/);
  });

  it('surfaces a non-ok status without leaking the URL', async () => {
    const source = makeGoogleFontSource(
      vi.fn().mockResolvedValue(response('', { status: 404 })) as unknown as typeof fetch,
    );
    await expect(source.face(url)).rejects.toThrow(/status 404/);
    await expect(source.face(url)).rejects.not.toThrow(/raw\.githubusercontent/);
  });
});
