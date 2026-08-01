import { describe, expect, it } from 'vitest';
import { MAX_CONFIG_CHARS, parseMountConfig, resolveApiBase } from './config';

const DOC = 'https://host.example/admin/designer/';

describe('resolveApiBase', () => {
  it('resolves a relative base against the document and normalizes the slash', () => {
    expect(resolveApiBase('api', DOC)).toBe('https://host.example/admin/designer/api/');
    expect(resolveApiBase('api/', DOC)).toBe('https://host.example/admin/designer/api/');
    expect(resolveApiBase('/shojiku-api/', DOC)).toBe('https://host.example/shojiku-api/');
  });

  it('admits an absolute same-origin base', () => {
    expect(resolveApiBase('https://host.example/api/', DOC)).toBe('https://host.example/api/');
  });

  it('rejects a base that leaves the origin', () => {
    expect(resolveApiBase('https://evil.example/api/', DOC)).toBeNull();
    expect(resolveApiBase('//evil.example/api/', DOC)).toBeNull();
    expect(resolveApiBase('http://host.example/api/', DOC)).toBeNull();
  });

  it('rejects credentials, non-strings, and unresolvable input', () => {
    expect(resolveApiBase('https://user@host.example/api/', DOC)).toBeNull();
    expect(resolveApiBase('https://u:p@host.example/api/', DOC)).toBeNull();
    expect(resolveApiBase('', DOC)).toBeNull();
    expect(resolveApiBase(7, DOC)).toBeNull();
    expect(resolveApiBase('api', 'not a url')).toBeNull();
  });
});

describe('parseMountConfig', () => {
  it('parses the http persistence config', () => {
    const raw = JSON.stringify({ persistence: { kind: 'http', base: 'api/' } });
    expect(parseMountConfig(raw, DOC)).toEqual({
      apiBase: 'https://host.example/admin/designer/api/',
    });
  });

  it.each([
    ['malformed JSON', 'not json'],
    ['non-object body', '[]'],
    ['missing persistence', '{}'],
    ['non-object persistence', '{"persistence": "http"}'],
    ['unknown kind', '{"persistence": {"kind": "ftp", "base": "api/"}}'],
    ['cross-origin base', '{"persistence": {"kind": "http", "base": "https://evil.example/"}}'],
    ['missing base', '{"persistence": {"kind": "http"}}'],
  ])('degrades to standalone on %s', (_label, raw) => {
    expect(parseMountConfig(raw, DOC)).toBeNull();
  });

  it('degrades to standalone on an oversized config without parsing it', () => {
    const raw = `{"persistence": {"kind": "http", "base": "api/${' '.repeat(MAX_CONFIG_CHARS)}"}}`;
    expect(parseMountConfig(raw, DOC)).toBeNull();
  });
});
