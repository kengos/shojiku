// The hints for other tools: the recommendedStyle bag MERGE (other keys kept, the
// last key's removal removing the bag, an unreadable bag never written, authored
// values outside the controls kept), the edits replayed through the definitions
// edit list's coalescing, and a table's row name.

import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { applyDefinitionOps, coalesceDefsEdit } from './definitionsEdit';
import { boldOp, readRecommended, readRowTitle, rowTitleOp, textAlignOp } from './recommendedStyle';

const AT = ['properties', 'total'];
const bag = (value: string) =>
  `type: object\nproperties:\n  total:\n    type: number\n    recommendedStyle: ${value}\n`;
const NONE = 'type: object\nproperties:\n  total:\n    type: number # the amount\n';

describe('readRecommended', () => {
  it('reads an absent bag as an empty map', () => {
    expect(readRecommended(NONE, AT)).toEqual({
      kind: 'map',
      textAlign: '',
      fontWeight: '',
      others: [],
      keys: [],
    });
  });

  it('reads the two keys and lists the others in authored order', () => {
    expect(readRecommended(bag('{ color: red, textAlign: right, fontWeight: 700 }'), AT)).toEqual({
      kind: 'map',
      textAlign: 'right',
      fontWeight: '700',
      others: ['color'],
      keys: ['color', 'textAlign', 'fontWeight'],
    });
  });

  it('reads a scalar, a list or a null bag as unreadable', () => {
    for (const value of ['right', '[ a ]', '~']) {
      expect(readRecommended(bag(value), AT).kind, value).toBe('unreadable');
    }
  });

  it('keeps prototype-named keys as plain data', () => {
    const read = readRecommended(bag('{ "__proto__": 1, constructor: 2 }'), AT);
    expect(read).toMatchObject({ kind: 'map', others: ['__proto__', 'constructor'] });
  });
});

describe('textAlignOp / boldOp', () => {
  it('creates the bag with the first key', () => {
    const read = readRecommended(NONE, AT);
    expect(textAlignOp(AT, read, 'right')).toEqual({
      op: 'setScalar',
      keys: [...AT, 'recommendedStyle', 'textAlign'],
      value: 'right',
    });
    expect(applyDefinitionOps(NONE, [textAlignOp(AT, read, 'right') as Op])).toContain(
      'recommendedStyle:\n      textAlign: right',
    );
  });

  it('merges into a bag with other keys, keeping them on set and on clear', () => {
    const text = bag('{ color: red, textAlign: left }');
    const read = readRecommended(text, AT);
    const set = applyDefinitionOps(text, [textAlignOp(AT, read, 'center') as Op]);
    expect(readRecommended(set, AT)).toMatchObject({ textAlign: 'center', others: ['color'] });
    const cleared = applyDefinitionOps(text, [textAlignOp(AT, read, '') as Op]);
    expect(readRecommended(cleared, AT)).toMatchObject({ textAlign: '', others: ['color'] });
  });

  it('removes the bag with its last key, so no empty map is left', () => {
    const text = bag('{ textAlign: left }');
    expect(textAlignOp(AT, readRecommended(text, AT), '')).toEqual({
      op: 'removeKey',
      keys: [...AT, 'recommendedStyle'],
    });
    const boldOnly = bag('{ fontWeight: bold }');
    expect(boldOp(AT, readRecommended(boldOnly, AT), false)).toEqual({
      op: 'removeKey',
      keys: [...AT, 'recommendedStyle'],
    });
  });

  it('authors nothing for a re-pick, and nothing at all on an unreadable bag', () => {
    const read = readRecommended(bag('{ textAlign: left, fontWeight: bold }'), AT);
    expect(textAlignOp(AT, read, 'left')).toBeNull();
    expect(boldOp(AT, read, true)).toBeNull();
    const unreadable = readRecommended(bag('right'), AT);
    expect(textAlignOp(AT, unreadable, 'left')).toBeNull();
    expect(boldOp(AT, unreadable, true)).toBeNull();
  });

  it('replaces another weight with bold, and unticking another weight authors nothing', () => {
    const read = readRecommended(bag('{ fontWeight: 600 }'), AT);
    expect(boldOp(AT, read, true)).toMatchObject({ op: 'setScalar', value: 'bold' });
    expect(boldOp(AT, read, false)).toBeNull();
  });

  it('keeps an authored alignment outside the three through a bold edit', () => {
    const text = bag('{ textAlign: justify }');
    const after = applyDefinitionOps(text, [boldOp(AT, readRecommended(text, AT), true) as Op]);
    expect(readRecommended(after, AT)).toMatchObject({ textAlign: 'justify', fontWeight: 'bold' });
  });
});

describe('the edits replayed through the coalesced edit list', () => {
  const replay = (base: string, steps: ((text: string) => Op | null)[]) => {
    let edits: Op[] = [];
    let text = base;
    for (const step of steps) {
      const op = step(text);
      if (op !== null) {
        edits = coalesceDefsEdit(edits, op);
        text = applyDefinitionOps(base, edits);
      }
    }
    return text;
  };
  const align = (value: string) => (text: string) =>
    textAlignOp(AT, readRecommended(text, AT), value);
  const bold = (on: boolean) => (text: string) => boldOp(AT, readRecommended(text, AT), on);

  it('set → clear (bag removed) → set again ends with the alignment alone', () => {
    const text = replay(NONE, [align('right'), align(''), align('left')]);
    expect(readRecommended(text, AT)).toMatchObject({ textAlign: 'left', keys: ['textAlign'] });
  });

  it('both set, then both cleared in either order, leaves no bag', () => {
    for (const order of [
      [align('right'), bold(true), align(''), bold(false)],
      [align('right'), bold(true), bold(false), align('')],
    ]) {
      const text = replay(NONE, order);
      expect(text).not.toContain('recommendedStyle');
      expect(text).toContain('# the amount');
    }
  });
});

describe('a table row name', () => {
  const TABLE =
    'type: object\nproperties:\n  lines:\n    type: array\n    items:\n      type: object\n      title: 明細行\n';
  const at = ['properties', 'lines'];

  it('reads, sets, clears and authors nothing unchanged', () => {
    expect(readRowTitle(TABLE, at)).toBe('明細行');
    expect(readRowTitle(TABLE, ['properties', 'nope'])).toBe('');
    expect(rowTitleOp(at, '明細行', '行')).toEqual({
      op: 'setScalar',
      keys: [...at, 'items', 'title'],
      value: '行',
    });
    expect(rowTitleOp(at, '明細行', '')).toEqual({
      op: 'removeKey',
      keys: [...at, 'items', 'title'],
    });
    expect(rowTitleOp(at, '明細行', '明細行')).toBeNull();
  });
});
