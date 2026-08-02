import { describe, expect, it } from 'vitest';
import {
  clampTemplateMaxBytes,
  MAX_TEMPLATE_BYTES,
  MAX_TEMPLATE_BYTES_CEILING,
  parseTemplate,
  readTemplate,
  TemplateParseError,
} from './document';

const SIMPLE = 'version: 0.1.0\nname: receipt\n';

/** A comment line of exactly `bytes` UTF-8 bytes (ASCII, one byte per char). */
function commentOfBytes(bytes: number): string {
  return `#${'x'.repeat(bytes - 1)}`;
}

describe('parseTemplate', () => {
  it('parses valid template source', () => {
    const doc = parseTemplate(SIMPLE);
    expect(String(doc)).toBe(SIMPLE);
  });

  it('rejects source over the byte cap', () => {
    const huge = `# ${'x'.repeat(MAX_TEMPLATE_BYTES + 1)}\n`;
    expect(() => parseTemplate(huge)).toThrow(TemplateParseError);
  });

  it('rejects malformed YAML with a TemplateParseError', () => {
    expect(() => parseTemplate('a: [1, 2\n')).toThrow(TemplateParseError);
  });

  it('accepts a source between the default cap and a raised custom cap', () => {
    const source = `${commentOfBytes(MAX_TEMPLATE_BYTES + 1024)}\n`;
    expect(() => parseTemplate(source)).toThrow(TemplateParseError);
    expect(() => parseTemplate(source, MAX_TEMPLATE_BYTES + 4096)).not.toThrow();
  });

  it('clamps a custom cap down to the ceiling', () => {
    // A source just over the ceiling is rejected even when a caller asks for a
    // wildly larger limit — the ceiling is absolute.
    const source = `${commentOfBytes(MAX_TEMPLATE_BYTES_CEILING + 1024)}\n`;
    expect(() => parseTemplate(source, Number.MAX_SAFE_INTEGER)).toThrow(TemplateParseError);
  });

  it('accepts a source exactly at the resolved cap and rejects one byte over', () => {
    const cap = MAX_TEMPLATE_BYTES + 4096;
    const atLimit = commentOfBytes(cap);
    expect(new TextEncoder().encode(atLimit).length).toBe(cap);
    expect(() => parseTemplate(atLimit, cap)).not.toThrow();
    expect(() => parseTemplate(`${atLimit}x`, cap)).toThrow(TemplateParseError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])(
    'falls back to the default cap for the hostile limit %s',
    (bad) => {
      const overDefault = `${commentOfBytes(MAX_TEMPLATE_BYTES + 1024)}\n`;
      expect(() => parseTemplate(overDefault, bad)).toThrow(TemplateParseError);
      expect(String(parseTemplate(SIMPLE, bad))).toBe(SIMPLE);
    },
  );
});

describe('clampTemplateMaxBytes', () => {
  it('returns the default for undefined / hostile values', () => {
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -5, 0]) {
      expect(clampTemplateMaxBytes(bad)).toBe(MAX_TEMPLATE_BYTES);
    }
  });

  it('floors below the default and caps at the ceiling', () => {
    expect(clampTemplateMaxBytes(1024)).toBe(MAX_TEMPLATE_BYTES);
    expect(clampTemplateMaxBytes(MAX_TEMPLATE_BYTES_CEILING * 4)).toBe(MAX_TEMPLATE_BYTES_CEILING);
  });

  it('passes an in-range value through', () => {
    const mid = MAX_TEMPLATE_BYTES + (MAX_TEMPLATE_BYTES_CEILING - MAX_TEMPLATE_BYTES) / 2;
    expect(clampTemplateMaxBytes(mid)).toBe(mid);
  });
});

const ALIAS_BOMB = [
  'a: &a ["x", "x", "x", "x", "x", "x", "x", "x", "x", "x"]',
  'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]',
  'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
  'd: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]',
  '',
].join('\n');

describe('readTemplate', () => {
  it('returns a plain-JS view of the document', () => {
    const doc = parseTemplate(SIMPLE);
    expect(readTemplate(doc)).toEqual({ version: '0.1.0', name: 'receipt' });
  });

  it('does not pollute Object.prototype via a __proto__ key', () => {
    const doc = parseTemplate('__proto__:\n  polluted: true\nname: ok\n');
    readTemplate(doc);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects an alias bomb when materializing the view', () => {
    const doc = parseTemplate(ALIAS_BOMB);
    expect(() => readTemplate(doc)).toThrow(TemplateParseError);
  });
});
