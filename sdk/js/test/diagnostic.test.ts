import { describe, expect, it } from 'vitest';
import { Diagnostic } from '../src/index.js';
import { makeClient } from './support/fixtures.js';

describe('Diagnostic', () => {
  it('parses the engine payload', () => {
    const parsed = Diagnostic.parse(
      JSON.stringify({
        items: [
          {
            severity: 'warning',
            code: 'box_overflow',
            category: 'layout',
            message: 'the box is too small',
            path: 'sections.body.items[0]',
            args: { needed: 25.2 },
            origin: 'layout/text.rs:42',
          },
        ],
      }),
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe('box_overflow');
    expect(parsed[0].path).toBe('sections.body.items[0]');
    // `args` passes through with the engine's typed values, untranslated.
    expect(parsed[0].args).toEqual({ needed: 25.2 });
    expect(parsed[0].origin).toBe('layout/text.rs:42');
  });

  it('is nothing at all for an empty payload', () => {
    expect(Diagnostic.parse('')).toEqual([]);
  });

  it('copes with a payload whose items key is absent or not a list', () => {
    expect(Diagnostic.parse('{}')).toEqual([]);
    expect(Diagnostic.parse('{"items":null}')).toEqual([]);
  });

  it('leaves every absent field null rather than inventing one', () => {
    const [diagnostic] = Diagnostic.parse('{"items":[{}]}');

    expect(diagnostic.severity).toBeNull();
    expect(diagnostic.code).toBeNull();
    expect(diagnostic.category).toBeNull();
    expect(diagnostic.message).toBeNull();
    expect(diagnostic.path).toBeNull();
    expect(diagnostic.origin).toBeNull();
    expect(diagnostic.args).toEqual({});
  });

  it('ignores a non-object item and a non-string field', () => {
    const [diagnostic] = Diagnostic.parse('{"items":[{"code":42}]}');
    expect(diagnostic.code).toBeNull();

    const [fromNull] = Diagnostic.parse('{"items":[null]}');
    expect(fromNull.code).toBeNull();
  });

  it('answers the severity questions with an `is` prefix, because they are NOUNS', () => {
    const [warning] = Diagnostic.parse('{"items":[{"severity":"warning"}]}');
    const [error] = Diagnostic.parse('{"items":[{"severity":"error"}]}');

    expect(warning.isWarning).toBe(true);
    expect(warning.isError).toBe(false);
    expect(error.isError).toBe(true);
    expect(error.isWarning).toBe(false);
  });

  it('prints as its path and message', () => {
    const [located] = Diagnostic.parse('{"items":[{"path":"a.b","message":"m"}]}');
    const [unlocated] = Diagnostic.parse('{"items":[{"message":"m"}]}');

    expect(String(located)).toBe('a.b: m');
    expect(String(unlocated)).toBe('m');
  });

  it('carries the engine’s real codes through a real render', async () => {
    const result = await makeClient().generate('broken', {});

    expect(result.errors.map((item) => item.code)).toContain('image_source_missing');
    // Untranslated: the message is the engine's English default, and a
    // translating consumer renders its own from `code` + `args`.
    expect(result.errors[0].message).toBeTruthy();
  });
});
