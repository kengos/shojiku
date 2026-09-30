// Which rule stays open while the list changes under it: an applied op's
// exact remap, and an undo/redo followed from the list before and after.
import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { followOpenRule, openAfterOps } from './openRuleRemap';

const TABLE = 'sections.body.items[0]';
const LIST = `${TABLE}.row.conditionalStyles`;
const move = (from: number, to: number): Op => ({ op: 'moveItem', path: LIST, from, to });
const after = (open: number | null, ...ops: Op[]) => openAfterOps(open, ops, LIST);

describe('openAfterOps', () => {
  it('follows the open rule when it is the one moved', () => {
    expect(after(1, move(1, 3))).toBe(3);
  });

  it('shifts when a move crosses it, either way', () => {
    expect(after(2, move(0, 3))).toBe(1);
    expect(after(2, move(4, 0))).toBe(3);
  });

  it('keeps it when a move stays on one side of it', () => {
    expect(after(2, move(0, 1))).toBe(2);
    expect(after(1, move(3, 2))).toBe(1);
  });

  it('ignores ops on any other sequence', () => {
    expect(after(1, { op: 'moveItem', path: `${LIST}[0].styleNames`, from: 0, to: 1 })).toBe(1);
    expect(after(1, { op: 'removeItem', path: `${TABLE}.columns`, index: 0 })).toBe(1);
    expect(after(1, { op: 'insertItem', path: `${TABLE}.columns`, index: 0, value: {} })).toBe(1);
  });

  it('closes when its own rule is removed, and shifts past an earlier removal', () => {
    expect(after(1, { op: 'removeItem', path: LIST, index: 1 })).toBeNull();
    expect(after(2, { op: 'removeItem', path: LIST, index: 0 })).toBe(1);
    expect(after(1, { op: 'removeItem', path: LIST, index: 2 })).toBe(1);
  });

  it('shifts past an insertion at or before it, not after', () => {
    const insert = (index: number): Op => ({ op: 'insertItem', path: LIST, index, value: {} });
    expect(after(1, insert(1))).toBe(2);
    expect(after(1, insert(2))).toBe(1);
  });

  it('shifts past a duplicate of an earlier rule only', () => {
    const dup = (index: number): Op => ({ op: 'duplicateItem', path: LIST, index });
    expect(after(2, dup(0))).toBe(3);
    expect(after(2, dup(2))).toBe(2);
    expect(after(2, { op: 'duplicateItem', path: `${TABLE}.columns`, index: 0 })).toBe(2);
  });

  it('follows a cross-sequence move out of and into the list', () => {
    const out = (from: number): Op => ({ ...move(from, 0), toPath: 'other' }) as Op;
    expect(after(1, out(1))).toBeNull();
    expect(after(2, out(0))).toBe(1);
    const into: Op = { op: 'moveItem', path: 'other', from: 0, to: 1, toPath: LIST };
    expect(after(1, into)).toBe(2);
    expect(after(0, into)).toBe(0);
  });

  it('closes when a key op replaces or removes the list or a map above it', () => {
    expect(
      after(0, { op: 'removeKey', path: TABLE, keys: ['row', 'conditionalStyles'] }),
    ).toBeNull();
    expect(after(0, { op: 'removeKey', path: TABLE, keys: ['row'] })).toBeNull();
    expect(
      after(0, { op: 'putValue', path: TABLE, keys: ['row', 'conditionalStyles'], value: [] }),
    ).toBeNull();
    expect(after(0, { op: 'renameKey', path: TABLE, keys: ['row'], to: 'rows' })).toBeNull();
  });

  it('keeps it through a key op beside or inside the list', () => {
    expect(after(0, { op: 'setScalar', path: TABLE, keys: ['row', 'height'], value: 20 })).toBe(0);
    expect(
      after(0, { op: 'setScalar', path: `${LIST}[0]`, keys: ['when', 'key'], value: 'x' }),
    ).toBe(0);
    // A root-level key op (no path) that is not above the list.
    expect(after(0, { op: 'setScalar', keys: ['page', 'size'], value: 'A4' })).toBe(0);
  });

  it('stays closed, and runs the ops in order', () => {
    expect(after(null, move(0, 1))).toBeNull();
    expect(after(1, { op: 'removeItem', path: LIST, index: 1 }, move(0, 1))).toBeNull();
    expect(after(0, move(0, 2), move(2, 1))).toBe(1);
  });
});

describe('followOpenRule (undo/redo)', () => {
  const A = { when: { key: 'a' } };
  const B = { when: { key: 'b' } };
  const C = { when: { key: 'c' } };

  it('follows the open rule through an undone move', () => {
    expect(followOpenRule([A, B, C], [B, C, A], 2)).toBe(1);
  });

  it('keeps the index when the same value is still there', () => {
    expect(followOpenRule([A, B], [A, B], 1)).toBe(1);
    // Identical rules swapping places: the open position still reads the same.
    expect(followOpenRule([A, A, B], [A, B, A], 0)).toBe(0);
  });

  it('keeps the index when the rule itself was edited', () => {
    expect(followOpenRule([A, B], [A, C], 1)).toBe(1);
  });

  it('does not jump to another rule that equals the undone value', () => {
    // Rule 1 was edited to equal rule 0; undoing that must stay on rule 1.
    expect(followOpenRule([A, A], [A, B], 1)).toBe(1);
  });

  it('follows one entry taken out or put back', () => {
    expect(followOpenRule([A, B, C], [B, C], 2)).toBe(1);
    expect(followOpenRule([A, B, C], [A, B], 1)).toBe(1);
    expect(followOpenRule([A, B, C], [A, C], 1)).toBeNull();
    expect(followOpenRule([B, C], [A, B, C], 1)).toBe(2);
    expect(followOpenRule([A, B], [A, B, C], 1)).toBe(1);
  });

  it('keeps the index across a change of any other shape', () => {
    expect(followOpenRule([A], [B, C, A], 0)).toBe(0);
    expect(followOpenRule([A, B, C], [C, A], 0)).toBe(0);
  });

  it('shows the list once the index is past the end, and stays closed', () => {
    expect(followOpenRule([A, B], [], 0)).toBeNull();
    expect(followOpenRule([A, B], [A], 1)).toBeNull();
    expect(followOpenRule([A, B], [B, A], null)).toBeNull();
    // A reorder with the index already past the end closes rather than
    // searching for a value that index never had.
    expect(followOpenRule([A, B], [B, A], 5)).toBeNull();
  });

  it('compares a malformed entry like any other value', () => {
    expect(followOpenRule([null, 'x', A], [A, null, 'x'], 2)).toBe(0);
  });
});
