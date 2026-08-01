// Mount-config discovery: the same static build serves standalone and mounted.
// At boot the app fetches `config.json` beside `index.html`; a valid config
// switches on the mounted persistence provider, and EVERYTHING else — absence
// (404), malformed JSON, an unknown kind, a base that would leave the origin —
// degrades to standalone, never to a crash. The config file is host-controlled
// but still fetched data: every field is runtime-guarded, and the persistence
// base is admitted only as a same-origin URL (a config must never be able to
// point saves at another origin).

/** Cap on the config body — a config is a few lines, ever. */
export const MAX_CONFIG_CHARS = 4096;

/** The validated mount configuration. `apiBase` is an absolute same-origin
 * URL with a trailing slash, ready for endpoint composition. */
export interface MountConfig {
  readonly apiBase: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Resolve a config's persistence base against the document base and admit it
 * only when it stays on the document's origin (no credentials, no scheme
 * change). Returns the normalized absolute URL with a trailing slash. */
export function resolveApiBase(base: unknown, documentBase: string): string | null {
  if (typeof base !== 'string' || base === '') {
    return null;
  }
  let resolved: URL;
  let document_: URL;
  try {
    resolved = new URL(base, documentBase);
    document_ = new URL(documentBase);
  } catch {
    return null;
  }
  if (
    resolved.origin !== document_.origin ||
    resolved.username !== '' ||
    resolved.password !== ''
  ) {
    return null;
  }
  return resolved.href.endsWith('/') ? resolved.href : `${resolved.href}/`;
}

/** Parse a fetched `config.json` body. `null` = run standalone. */
export function parseMountConfig(raw: string, documentBase: string): MountConfig | null {
  if (raw.length > MAX_CONFIG_CHARS) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const persistence = asRecord(asRecord(parsed)?.persistence);
  if (persistence === null || persistence.kind !== 'http') {
    return null;
  }
  const apiBase = resolveApiBase(persistence.base, documentBase);
  return apiBase === null ? null : { apiBase };
}
