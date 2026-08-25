import { describe, expect, it } from 'vitest';
import { MAX_TEXT_EXPRS } from '../text/interpolate';
import { chipFormats, rewriteChipFormat } from './chipRefs';

describe('chipFormats', () => {
  it('reports the expressions that PICK a format, and only those', () => {
    expect(chipFormats('{a} {b:closing} x {c.d:received}')).toEqual({
      formats: [
        { name: 'b', format: 'closing' },
        { name: 'c.d', format: 'received' },
      ],
      capped: false,
    });
  });

  it('reports nothing for text with no expression at all', () => {
    // Both arms: the cheap no-brace short-circuit the walk leans on for the
    // overwhelming majority of strings, and a braced text that parses to no
    // format-picking expression.
    expect(chipFormats('plain text, no braces')).toEqual({ formats: [], capped: false });
    expect(chipFormats('plain {{escaped}} {bare} text')).toEqual({ formats: [], capped: false });
  });

  it('flags a text AT the expression cap as possibly incomplete', () => {
    const under = Array.from({ length: MAX_TEXT_EXPRS - 1 }, () => '{a:x}').join('');
    expect(chipFormats(under).capped).toBe(false);
    const at = Array.from({ length: MAX_TEXT_EXPRS }, () => '{a:x}').join('');
    expect(chipFormats(at).capped).toBe(true);
  });

  it('ignores a malformed expression, which the engine leaves literal too', () => {
    expect(chipFormats('{unclosed:closing and {:closing}').formats).toEqual([]);
  });
});

describe('rewriteChipFormat', () => {
  it('renames every occurrence of ONE name and leaves the rest byte-identical', () => {
    const text = 'A {x:closing} B {y:closing} C {z:received} D {w} {{lit}}';
    expect(rewriteChipFormat(text, 'closing', 'cutoff')).toBe(
      'A {x:cutoff} B {y:cutoff} C {z:received} D {w} {{lit}}',
    );
  });

  it('strips the pick on a delete, leaving the binding itself in place', () => {
    expect(rewriteChipFormat('paid {x:closing}', 'closing', null)).toBe('paid {x}');
  });

  it('returns the input unchanged when the name does not appear', () => {
    const text = 'nothing {here:other} to do — {{a}} }{ ';
    expect(rewriteChipFormat(text, 'closing', 'cutoff')).toBe(text);
  });

  it('reproduces a malformed expression verbatim rather than repairing it', () => {
    const text = '{unclosed:closing plus {ok:closing}';
    expect(rewriteChipFormat(text, 'closing', 'cutoff')).toBe('{unclosed:closing plus {ok:cutoff}');
  });
});
