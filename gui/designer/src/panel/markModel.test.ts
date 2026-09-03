// The READ side of a form mark's presence. What carries the weight here is
// what the row must be able to tell APART: an absent `checked` from
// `checked: false` (they are different documents and the ops must not remove a
// key that is not there), and a mark that binds from one that ticks.

import { describe, expect, it } from 'vitest';
import { readMark } from './markModel';

const P = 'sections.body.items[0]';
const read = (item: unknown) => (path: string) => (path === P ? item : undefined);

describe('the static form', () => {
  it('reads an ellipse with no data as always-drawing', () => {
    const row = readMark(read({ type: 'ellipse', box: { w: 60, h: 40 } }), P);
    expect(row.mode).toBe('static');
    expect(row.checked).toBe(false);
    expect(row.hasChecked).toBe(false);
    expect(row.conflict).toBe(false);
  });

  it('tells an ABSENT `checked` apart from an authored `false`', () => {
    // Both draw a blank box, but only one has a key to remove — and removing an
    // absent key refuses the whole batch.
    expect(readMark(read({ type: 'checkbox' }), P).hasChecked).toBe(false);
    const off = readMark(read({ type: 'checkbox', checked: false }), P);
    expect(off.hasChecked).toBe(true);
    expect(off.checked).toBe(false);
  });

  it('reads `checked: true` as ticked', () => {
    const row = readMark(read({ type: 'checkbox', checked: true }), P);
    expect(row.checked).toBe(true);
    expect(row.hasChecked).toBe(true);
  });
});

describe('the bound form', () => {
  it('reads the key, the equals and the document scope', () => {
    const row = readMark(
      read({ type: 'checkbox', data: { key: 'method', equals: 'card', scope: 'document' } }),
      P,
    );
    expect(row).toMatchObject({
      mode: 'bound',
      key: 'method',
      equals: 'card',
      hasEquals: true,
      documentScope: true,
    });
  });

  it('tells an ABSENT `data.scope` apart from an authored one', () => {
    // `documentScope` cannot stand in for this: it is false both for an absent
    // key and for an authored `element`, and only one of those may be removed.
    expect(readMark(read({ type: 'checkbox', data: { key: 'a' } }), P).hasScope).toBe(false);
    const el = readMark(read({ type: 'checkbox', data: { key: 'a', scope: 'element' } }), P);
    expect(el.hasScope).toBe(true);
    expect(el.documentScope).toBe(false);
    expect(
      readMark(read({ type: 'checkbox', data: { key: 'a', scope: 'document' } }), P).hasScope,
    ).toBe(true);
  });

  it('reads a binding with no `equals` as the boolean form', () => {
    const row = readMark(read({ type: 'checkbox', data: { key: 'agreed' } }), P);
    expect(row.hasEquals).toBe(false);
    expect(row.equals).toBe('');
  });

  it('renders a numeric and a boolean `equals` as their text', () => {
    expect(readMark(read({ type: 'ellipse', data: { key: 'n', equals: 2 } }), P).equals).toBe('2');
    expect(readMark(read({ type: 'ellipse', data: { key: 'b', equals: true } }), P).equals).toBe(
      'true',
    );
  });

  it('reports a `checked` + `data:` document as a CONFLICT', () => {
    // The wire calls them mutually exclusive and the engine warns with `data:`
    // winning; showing one and hiding the other would leave a key in the file
    // the panel never mentions.
    const row = readMark(read({ type: 'checkbox', checked: true, data: { key: 'x' } }), P);
    expect(row.conflict).toBe(true);
    expect(row.mode).toBe('bound');
  });
});

describe('untrusted documents degrade, never throw', () => {
  it('reads a non-map `data` as the static form', () => {
    // There is no row to edit and the engine's parse error is the honest
    // report; the panel must not invent one.
    expect(readMark(read({ type: 'ellipse', data: 'yes' }), P).mode).toBe('static');
    expect(readMark(read({ type: 'ellipse', data: ['a'] }), P).mode).toBe('static');
    expect(readMark(read({ type: 'ellipse', data: null }), P).mode).toBe('static');
  });

  it('reads a non-string key as unset rather than echoing it', () => {
    expect(readMark(read({ type: 'ellipse', data: { key: 42 } }), P).key).toBe('');
  });

  it('reads a CONTAINER `equals` as unset — the engine rejects one at parse', () => {
    const row = readMark(read({ type: 'ellipse', data: { key: 'x', equals: { a: 1 } } }), P);
    expect(row.equals).toBe('');
    // The key IS authored, which is what decides whether the boolean form is
    // in play — that stays true even though nothing displayable came back.
    expect(row.hasEquals).toBe(true);
  });

  it('clips a hostile key rather than letting it paint out of the column', () => {
    const row = readMark(read({ type: 'ellipse', data: { key: 'x'.repeat(400) } }), P);
    expect(row.key.length).toBe(81);
    expect(row.key.endsWith('…')).toBe(true);
  });

  it('survives a read that THROWS', () => {
    const throwing = () => {
      throw new Error('hostile');
    };
    expect(readMark(throwing, P).mode).toBe('static');
  });

  it('leaves `__proto__` inert', () => {
    // The key is document-derived, so a lookup that walked a plain object's
    // prototype chain would resolve it to something.
    const row = readMark(read({ type: 'ellipse', data: { key: '__proto__' } }), P);
    expect(row.key).toBe('__proto__');
    expect(row.mode).toBe('bound');
    expect(Object.hasOwn(row, 'constructor')).toBe(false);
  });

  it('reads an unreadable item as the static form', () => {
    expect(readMark(() => 'not a map', P).mode).toBe('static');
  });
});
