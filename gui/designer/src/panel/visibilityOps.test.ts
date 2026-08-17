// The op builders for an item's `visible:` binding. Two rules carry most of
// the weight here and both are invisible to a "does it write the key" test:
// clearing `collapse` must REMOVE the key rather than write `false` (unset
// never serializes), and a repoint must reconcile a stale `equals` in the
// same batch (one undo step).

import { describe, expect, it } from 'vitest';
import {
  addVisibleOp,
  removeVisibleOp,
  repointVisibleOps,
  setCollapseOp,
  setVisibleEqualsOp,
} from './visibilityOps';

const P = 'sections.body.items[2]';

describe('adding and removing the binding', () => {
  it('seeds the map with an empty key', () => {
    // The empty key is honest: the engine reports it until a field is
    // picked, exactly as the row-conditions editor's blank rule does.
    expect(addVisibleOp(P)).toEqual({
      op: 'putValue',
      path: P,
      keys: ['visible'],
      value: { key: '' },
    });
  });

  it('drops the whole key so the item draws unconditionally again', () => {
    expect(removeVisibleOp(P)).toEqual({ op: 'removeKey', path: P, keys: ['visible'] });
  });
});

describe('collapse', () => {
  it('writes `true` when turned on', () => {
    expect(setCollapseOp(P, true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['visible', 'collapse'],
      value: true,
    });
  });

  it('REMOVES the key when turned off rather than writing false', () => {
    // `collapse: false` is the engine's default and never serializes, so
    // writing it would put a key in the file that the round-trip must then
    // carry forever.
    expect(setCollapseOp(P, false)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['visible', 'collapse'],
    });
  });
});

describe('equals', () => {
  it('writes a string literal verbatim', () => {
    expect(setVisibleEqualsOp(P, 'approved', 'string')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['visible', 'equals'],
      value: 'approved',
    });
  });

  it('writes a NUMBER for a numeric field, so the type-strict predicate can match', () => {
    expect(setVisibleEqualsOp(P, '2', 'currency')).toMatchObject({ value: 2 });
    expect(setVisibleEqualsOp(P, '2', 'number')).toMatchObject({ value: 2 });
  });

  it('keeps an unparseable numeric entry as a string rather than authoring NaN', () => {
    expect(setVisibleEqualsOp(P, 'two', 'number')).toMatchObject({ value: 'two' });
    expect(setVisibleEqualsOp(P, '   ', 'number')).toMatchObject({ value: '   ' });
  });

  it('removes the key for an empty or null value — that IS the boolean form', () => {
    for (const value of ['', null]) {
      expect(setVisibleEqualsOp(P, value)).toEqual({
        op: 'removeKey',
        path: P,
        keys: ['visible', 'equals'],
      });
    }
  });
});

describe('repointing at another field', () => {
  it('is one op when the new field can still DISPLAY the authored value', () => {
    // The value is a member of the new field's enum, so the select shows it.
    expect(
      repointVisibleOps(P, 'status', 'string', ['approved', 'draft'], true, 'approved'),
    ).toEqual([{ op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'status' }]);
  });

  it('clears a stale `equals` when the new ENUM does not list it', () => {
    // Otherwise the `<select>` falls back to "unset" while the wire still
    // says `approved` — the screen and the file disagree, invisibly.
    expect(repointVisibleOps(P, 'status', 'string', ['draft', 'sent'], true, 'approved')).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'status' },
      { op: 'removeKey', path: P, keys: ['visible', 'equals'] },
    ]);
  });

  it('keeps the value for a FREE-ENTRY field, which can show anything', () => {
    expect(repointVisibleOps(P, 'note', 'string', [], true, 'approved')).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'note' },
    ]);
  });

  it('clears a stale `equals` when the new field is boolean-form', () => {
    // A boolean field renders no value control, so a kept `equals` would be
    // invisible AND still override the boolean read on the wire.
    const ops = repointVisibleOps(P, 'paid', 'boolean', [], true, 'approved');
    expect(ops).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'paid' },
      { op: 'removeKey', path: P, keys: ['visible', 'equals'] },
    ]);
  });

  it('writes no clear when there was no `equals` to go stale', () => {
    expect(repointVisibleOps(P, 'paid', 'boolean', [], false, '')).toHaveLength(1);
  });
});

describe('the scope the field was picked at', () => {
  it('writes `scope: document` when a top-level field is picked from inside a row', () => {
    // Without this the key resolves against the bound ELEMENT, finds nothing,
    // and the item vanishes silently (no definitions) or reports an
    // undeclared key (with them) — from a plain pick in the UI.
    expect(repointVisibleOps(P, 'paid', 'boolean', [], false, '', true)).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'paid' },
      { op: 'setScalar', path: P, keys: ['visible', 'scope'], value: 'document' },
    ]);
  });

  it('REMOVES the scope key when a row field is picked — element is the default', () => {
    expect(repointVisibleOps(P, 'name', 'string', [], false, '', false)).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'name' },
      { op: 'removeKey', path: P, keys: ['visible', 'scope'] },
    ]);
  });

  it('leaves an authored scope untouched when the caller offers no choice', () => {
    // Typing a key must never re-scope the binding: the file keeps what it
    // says. `undefined` is that case, and it is the one a document-scope
    // picker outside any row also takes.
    expect(repointVisibleOps(P, 'paid', 'boolean', [], false, '')).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'paid' },
    ]);
  });

  it('still clears a stale `equals` alongside the scope, as ONE batch', () => {
    expect(repointVisibleOps(P, 'paid', 'boolean', [], true, 'approved', true)).toEqual([
      { op: 'setScalar', path: P, keys: ['visible', 'key'], value: 'paid' },
      { op: 'setScalar', path: P, keys: ['visible', 'scope'], value: 'document' },
      { op: 'removeKey', path: P, keys: ['visible', 'equals'] },
    ]);
  });
});
