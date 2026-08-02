// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { radiusOps, readRadius } from './borderRadius';

describe('borderRadius: cascade, authored form, and minimal writes', () => {
  const read = (doc: Record<string, unknown>) => (path: string) =>
    path === 'styles' ? doc.styles : doc.item;

  it('reads an own radius in its AUTHORED form', () => {
    const pt = readRadius(read({ item: { style: { borderRadius: 6 } } }), 'x');
    expect(pt).toMatchObject({ effective: '6', origin: 'own', ownPresent: true });
    const pct = readRadius(read({ item: { style: { borderRadius: '50%' } } }), 'x');
    expect(pct).toMatchObject({ effective: '50%', origin: 'own' });
  });

  it('falls back to a named style, reporting where it came from', () => {
    const view = readRadius(
      read({
        item: { styleNames: ['card'] },
        styles: { card: { borderRadius: '4mm' } },
      }),
      'x',
    );
    expect(view).toEqual({
      effective: '4mm',
      origin: 'style',
      styleName: 'card',
      ownPresent: false,
    });
  });

  it('reads a hostile in-memory value as unset rather than crashing', () => {
    for (const bad of [{ top: 4 }, true, [4], Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(readRadius(read({ item: { style: { borderRadius: bad } } }), 'x').effective).toBe('');
    }
    expect(readRadius(read({ item: {} }), 'x')).toMatchObject({ origin: 'unset', effective: '' });
  });

  it('writes nothing when the committed text matches the CASCADE-effective value', () => {
    // The touched-keys invariant across the cascade: re-committing a radius
    // that a named style supplies must not author an own copy of it.
    const view = readRadius(
      read({ item: { styleNames: ['card'] }, styles: { card: { borderRadius: '50%' } } }),
      'x',
    );
    expect(radiusOps('x', view, '50%')).toEqual([]);
    expect(radiusOps('x', view, ' 50% ')).toEqual([]);
  });

  it('authors a bare numeral as a NUMBER and anything else verbatim', () => {
    const unset = readRadius(read({ item: {} }), 'x');
    expect(radiusOps('x', unset, '6')).toEqual([
      { op: 'setScalar', path: 'x', keys: ['style', 'borderRadius'], value: 6 },
    ]);
    expect(radiusOps('x', unset, '50%')).toEqual([
      { op: 'setScalar', path: 'x', keys: ['style', 'borderRadius'], value: '50%' },
    ]);
  });

  it('clearing a style-supplied radius authors an explicit 0 to override it', () => {
    // removeKey would revert to the style's rounding, so the field would
    // snap back to the value the user just cleared.
    const view = readRadius(
      read({ item: { styleNames: ['card'] }, styles: { card: { borderRadius: 8 } } }),
      'x',
    );
    expect(radiusOps('x', view, '')).toEqual([
      { op: 'setScalar', path: 'x', keys: ['style', 'borderRadius'], value: 0 },
    ]);
  });

  it('clears an own radius but leaves an unset one alone', () => {
    const own = readRadius(read({ item: { style: { borderRadius: 8 } } }), 'x');
    expect(radiusOps('x', own, '')).toEqual([
      { op: 'removeKey', path: 'x', keys: ['style', 'borderRadius'] },
    ]);
    const unset = readRadius(read({ item: {} }), 'x');
    expect(radiusOps('x', unset, '')).toEqual([]);
  });
});
