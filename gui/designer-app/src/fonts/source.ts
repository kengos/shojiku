// Fetching a picked family's face bytes + licence text.
//
// The URLs come from the catalog snapshot, which is our own build artifact —
// but it is fetched at runtime, and a pinned `url:` also arrives from a
// persisted draft, so this module re-checks every URL against a fixed allowlist
// before opening a connection. The snapshot is the convenience; the allowlist
// is the control. A URL that fails it yields an error and no request at all.
//
// Pure over an injected `fetch`, so tests need no network and the browser host
// passes `window.fetch`.

/** The only origin a picked font may be fetched from. Matches the CSP's
 * `connect-src` and the engine's own default fetch allowlist, so a manifest
 * this app generates is fetchable by the CLI with no extra flag. */
export const ALLOWED_ORIGIN = 'https://raw.githubusercontent.com';

/** A hard ceiling on one face. The heaviest static family in the catalog is a
 * few MB; 16 MiB leaves room without letting a rewritten URL stream forever. */
export const MAX_FACE_BYTES = 16 * 1024 * 1024;

/** A hard ceiling on a licence text (OFL is ~4 KB). */
export const MAX_LICENSE_BYTES = 256 * 1024;

/** Whether a URL is fetchable: https, exactly the allowed origin, no userinfo.
 * Parse-based, never a prefix test — `https://raw.githubusercontent.com.evil.test`
 * passes a `startsWith` check and fails this one. */
export function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.origin === ALLOWED_ORIGIN && parsed.username === '' && parsed.password === '';
}

/** Thrown when a URL is off the allowlist or a response exceeds its cap. The
 * message carries no URL — a hostile one would otherwise reach the UI. */
export class FontFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FontFetchError';
  }
}

async function fetchCapped(fetchFn: typeof fetch, url: string, cap: number): Promise<ArrayBuffer> {
  if (!isAllowedUrl(url)) {
    throw new FontFetchError('font URL is not on the allowlist');
  }
  // Redirects are refused, not followed: the allowlist checked THIS url, and a
  // hop could leave the checked origin (the CLI's fetch layer re-checks every
  // hop for the same reason; in the browser, CSP is the second layer).
  const response = await fetchFn(url, { redirect: 'error' });
  if (!response.ok) {
    throw new FontFetchError(`font fetch failed with status ${response.status}`);
  }
  // Check the declared length first (cheap rejection), then the real bytes —
  // the header is a hint, not a guarantee.
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > cap) {
    throw new FontFetchError('font resource exceeds the size cap');
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > cap) {
    throw new FontFetchError('font resource exceeds the size cap');
  }
  return buffer;
}

/** What the install/reload flows need in order to materialize a picked family. */
export interface GoogleFontSource {
  face(url: string): Promise<Uint8Array>;
  license(url: string): Promise<string>;
}

/** Build a source bound to an injected `fetch`. */
export function makeGoogleFontSource(fetchFn: typeof fetch): GoogleFontSource {
  return {
    face: async (url) => new Uint8Array(await fetchCapped(fetchFn, url, MAX_FACE_BYTES)),
    license: async (url) =>
      new TextDecoder().decode(await fetchCapped(fetchFn, url, MAX_LICENSE_BYTES)),
  };
}
