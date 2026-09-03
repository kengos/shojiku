// The op builders for a form mark's presence. Three rules carry the weight and
// none of them is visible to a "does it write the key" assertion: the mode
// switch must drop the OTHER key in the same batch (the wire calls them
// mutually exclusive), it must not remove a key the document does not carry
// (that refuses the whole batch), and turning a tick off must REMOVE the key
// rather than author `false`.

import { describe, expect, it } from 'vitest';
import {
  bindMarkOps,
  repointMarkOps,
  setCheckedOps,
  setMarkEqualsOp,
  unbindMarkOps,
} from './markOps';

const P = 'sections.body.items[3]';

describe('switching to the bound form', () => {
  it('seeds `data:` with an empty key', () => {
    expect(bindMarkOps(P, false)).toEqual([
      { op: 'putValue', path: P, keys: ['data'], value: { key: '' } },
    ]);
  });

  it('drops `checked` in the SAME batch when the document carries it', () => {
    // One undo step, and the document is never in the shape the wire calls
    // mutually exclusive.
    expect(bindMarkOps(P, true)).toEqual([
      { op: 'putValue', path: P, keys: ['data'], value: { key: '' } },
      { op: 'removeKey', path: P, keys: ['checked'] },
    ]);
  });
});

describe('switching back to the static form', () => {
  it('drops `data:` and writes the tick in one batch', () => {
    expect(unbindMarkOps(P, true, false)).toEqual([
      { op: 'removeKey', path: P, keys: ['data'] },
      { op: 'setScalar', path: P, keys: ['checked'], value: true },
    ]);
  });

  it('drops `data:` alone when the static form is the BLANK box', () => {
    // Unset never serializes: `checked: false` is a key the round trip would
    // then carry forever for a state the key's absence already means.
    expect(unbindMarkOps(P, false, false)).toEqual([{ op: 'removeKey', path: P, keys: ['data'] }]);
  });

  it('removes an AUTHORED `checked: false` on the way back', () => {
    expect(unbindMarkOps(P, false, true)).toEqual([
      { op: 'removeKey', path: P, keys: ['data'] },
      { op: 'removeKey', path: P, keys: ['checked'] },
    ]);
  });
});

describe('the static tick', () => {
  it('writes `true` when ticked', () => {
    expect(setCheckedOps(P, true, false)).toEqual([
      { op: 'setScalar', path: P, keys: ['checked'], value: true },
    ]);
  });

  it('REMOVES the key when unticked rather than writing false', () => {
    expect(setCheckedOps(P, false, true)).toEqual([
      { op: 'removeKey', path: P, keys: ['checked'] },
    ]);
  });

  it('authors NOTHING when the key is already absent', () => {
    // Removing an absent key refuses the whole batch, so the no-op has to be
    // an empty list rather than a removal that fails.
    expect(setCheckedOps(P, false, false)).toEqual([]);
  });
});

describe('repointing the binding', () => {
  it('writes the key alone when nothing else has to move', () => {
    expect(repointMarkOps(P, 'method', 'string', [], false, '')).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'method' },
    ]);
  });

  it('reconciles a stale `equals` in the SAME batch', () => {
    // A boolean-form field renders no value control, so a kept `equals` would
    // be invisible AND still override the boolean read.
    expect(repointMarkOps(P, 'agreed', 'boolean', [], true, 'card')).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'agreed' },
      { op: 'removeKey', path: P, keys: ['data', 'equals'] },
    ]);
  });

  it('writes `scope: document` when the field was offered at document scope', () => {
    expect(repointMarkOps(P, 'paid', 'boolean', [], false, '', true)).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'paid' },
      { op: 'setScalar', path: P, keys: ['data', 'scope'], value: 'document' },
    ]);
  });

  it('removes `scope:` when the field was offered at element scope AND one is there', () => {
    expect(repointMarkOps(P, 'paid', 'boolean', [], false, '', false, true)).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'paid' },
      { op: 'removeKey', path: P, keys: ['data', 'scope'] },
    ]);
  });

  it('emits NO removeKey at element scope when no scope is authored', () => {
    // The negative half, and the one that matters: `removeKey` on an absent key
    // returns `key_not_found`, and ONE failing op refuses the whole batch — so
    // the unguarded form took the `data.key` write down with it and the pick
    // did nothing, silently. Every mark this panel binds starts from
    // `bindMarkOps`' `{ key: '' }`, i.e. with no scope, so this is the common
    // case rather than an edge one.
    expect(repointMarkOps(P, 'paid', 'boolean', [], false, '', false, false)).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'paid' },
    ]);
  });
});

describe('the equals value', () => {
  it('writes a string literal verbatim', () => {
    expect(setMarkEqualsOp(P, 'card', 'string')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['data', 'equals'],
      value: 'card',
    });
  });

  it('writes a NUMBER for a numeric field', () => {
    // The engine's predicate is type-strict, so a quoted "2" would never match
    // a numeric 2 — and the user typed digits, not a string.
    for (const type of ['number', 'currency', 'percentage', 'quantity']) {
      expect(setMarkEqualsOp(P, ' 2 ', type)).toMatchObject({ value: 2 });
    }
  });

  it('keeps an unparseable numeric entry as a STRING', () => {
    // The engine then warns about the mismatch, which beats authoring `NaN`.
    expect(setMarkEqualsOp(P, 'two', 'number')).toMatchObject({ value: 'two' });
    expect(setMarkEqualsOp(P, '   ', 'number')).toMatchObject({ value: '   ' });
  });

  it('REMOVES the key for an empty or null value — that is the boolean form', () => {
    const removal = { op: 'removeKey', path: P, keys: ['data', 'equals'] };
    expect(setMarkEqualsOp(P, '')).toEqual(removal);
    expect(setMarkEqualsOp(P, null)).toEqual(removal);
  });
});
