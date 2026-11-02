// The declaration reads and ops a list's 「差し込みの設定」 is built on: what a
// `bindings:` value reads as (hostile shapes included), the `{name}` use count,
// the name a picked key suggests and why a typed name is refused — both
// decided by the interpolation parser — and the one op each add and delete is.

import { surfaceFields } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  addDeclarationOp,
  deleteDeclarationOp,
  entryFields,
  nameProblem,
  readDeclarations,
  suggestedName,
  usesOf,
} from './bindingsModel';
import { COMPOSITES } from './schema/composites';

describe('readDeclarations', () => {
  it('reads each name with its map and key, in document order', () => {
    expect(
      readDeclarations({ price: { key: 'unit_price', format: 'yen' }, qty: { key: 'qty' } }),
    ).toEqual([
      { name: 'price', values: { key: 'unit_price', format: 'yen' }, key: 'unit_price' },
      { name: 'qty', values: { key: 'qty' }, key: 'qty' },
    ]);
  });

  it('keeps a hostile entry as a name with nothing to edit, and reads no map as none', () => {
    expect(readDeclarations({ a: 3, b: { key: 7 } })).toEqual([
      { name: 'a', values: undefined, key: '' },
      { name: 'b', values: { key: 7 }, key: '' },
    ]);
    expect(readDeclarations(undefined)).toEqual([]);
    expect(readDeclarations(['a'])).toEqual([]);
  });
});

describe('usesOf', () => {
  it('counts every {name}, with a format too, and nothing else', () => {
    expect(usesOf('{price} / {price:yen} / {qty}', 'price')).toBe(2);
    // An escaped brace, a longer key and another name are not uses.
    expect(usesOf('{{price}} {price.x} {prices}', 'price')).toBe(0);
    expect(usesOf('', 'price')).toBe(0);
  });
});

describe('suggestedName', () => {
  it('suggests the last segment of a key when it is a valid name', () => {
    expect(suggestedName('order.lines.unit_price')).toBe('unit_price');
    expect(suggestedName('qty')).toBe('qty');
  });

  it('suggests nothing when the last segment is not one', () => {
    expect(suggestedName('品名')).toBe('');
    expect(suggestedName('order-code')).toBe('');
    expect(suggestedName('a.')).toBe('');
    expect(suggestedName('')).toBe('');
  });
});

describe('nameProblem', () => {
  it('refuses a name the interpolation cannot read, and a declared one', () => {
    expect(nameProblem('order-code', [])).toBe('charset');
    expect(nameProblem('品名', [])).toBe('charset');
    expect(nameProblem('price', ['price'])).toBe('taken');
  });

  it('accepts a free valid name, and reports nothing for an empty one', () => {
    expect(nameProblem('price', ['qty'])).toBeNull();
    expect(nameProblem('a.b_1', [])).toBeNull();
    expect(nameProblem('', ['price'])).toBeNull();
  });
});

describe('entryFields', () => {
  it('reads the declaration fields off the bindings map, the required key first', () => {
    const [bindings, overflowText] = surfaceFields({ kind: 'item', type: 'list' }, COMPOSITES);
    expect(entryFields(bindings).map((field) => field.key)).toEqual([
      'key',
      'format',
      'placeholder',
      'scope',
    ]);
    expect(entryFields(overflowText)).toEqual([]);
  });
});

describe('ops', () => {
  const P = 'sections.body.items[0]';

  it('adds a declaration as one map holding its key', () => {
    expect(addDeclarationOp(P, 'price', 'unit_price', { qty: { key: 'qty' } })).toEqual({
      op: 'putValue',
      path: P,
      keys: ['bindings', 'price'],
      value: { key: 'unit_price' },
    });
  });

  it('writes the whole map where there is none to add to', () => {
    for (const bindings of [undefined, null, 'x']) {
      expect(addDeclarationOp(P, 'price', 'unit_price', bindings)).toEqual({
        op: 'putValue',
        path: P,
        keys: ['bindings'],
        value: { price: { key: 'unit_price' } },
      });
    }
  });

  it('deletes the whole entry, and the empty map with the last one', () => {
    expect(deleteDeclarationOp(P, 'price', 2)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['bindings', 'price'],
    });
    expect(deleteDeclarationOp(P, 'price', 1)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['bindings'],
    });
  });
});
