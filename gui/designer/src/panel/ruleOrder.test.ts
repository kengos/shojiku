/// <reference types="node" />
// Where a row-condition rule sits: the reversed display ↔ wire mapping, the
// one `moveItem` a reorder emits (button and drag), and the engine cap the list
// mirrors.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { dragMoveOp, MAX_ROW_CONDITIONS, moveRuleOp, rulesPath, wireIndex } from './ruleOrder';

const TABLE = 'sections.body.items[0]';
const LIST = `${TABLE}.row.conditionalStyles`;
const THREE = ['a', 'b', 'c'];

describe('wireIndex', () => {
  it('puts the LAST entry at the top and is its own inverse', () => {
    expect([0, 1, 2].map((d) => wireIndex(3, d))).toEqual([2, 1, 0]);
    expect(wireIndex(3, wireIndex(3, 1))).toBe(1);
  });
});

describe('moveRuleOp', () => {
  it('is ONE moveItem on the list, in wire indices', () => {
    expect(moveRuleOp(TABLE, THREE, 0, 2)).toEqual({ op: 'moveItem', path: LIST, from: 0, to: 2 });
    expect(rulesPath(TABLE)).toBe(LIST);
  });

  it('refuses either end out of range, and a move that moves nothing', () => {
    expect(moveRuleOp(TABLE, THREE, -1, 0)).toBeNull();
    expect(moveRuleOp(TABLE, THREE, 3, 0)).toBeNull();
    expect(moveRuleOp(TABLE, THREE, 0, -1)).toBeNull();
    expect(moveRuleOp(TABLE, THREE, 0, 3)).toBeNull();
    expect(moveRuleOp(TABLE, THREE, 1, 1)).toBeNull();
    expect(moveRuleOp(TABLE, [], 0, 0)).toBeNull();
  });
});

describe('dragMoveOp', () => {
  it('maps a drag from the TOP card to below the last into a move to wire 0', () => {
    // Display [c, b, a]; c dropped after a → display [b, a, c] → wire [c, a, b].
    expect(dragMoveOp(TABLE, THREE, 0, 3)).toEqual({ op: 'moveItem', path: LIST, from: 2, to: 0 });
  });

  it('maps a drag from the BOTTOM card to the top into a move to the last wire slot', () => {
    expect(dragMoveOp(TABLE, THREE, 2, 0)).toEqual({ op: 'moveItem', path: LIST, from: 0, to: 2 });
  });

  it('maps a one-slot drag down', () => {
    // Display [c, b, a]; c dropped between b and a → display [b, c, a].
    expect(dragMoveOp(TABLE, THREE, 0, 2)).toEqual({ op: 'moveItem', path: LIST, from: 2, to: 1 });
  });

  it('moves nothing for the two slots around the card itself', () => {
    expect(dragMoveOp(TABLE, THREE, 1, 1)).toBeNull();
    expect(dragMoveOp(TABLE, THREE, 1, 2)).toBeNull();
  });

  it('refuses a card position the list does not have', () => {
    expect(dragMoveOp(TABLE, THREE, 5, 0)).toBeNull();
  });
});

describe('a reorder through the real editor', () => {
  const SOURCE = `sections:
  body:
    items:
      - type: table
        row:
          conditionalStyles:
            - when: { key: a } # first
            - when: { key: b } # second
`;

  it('swaps the entries with their own comments, as one undo step', () => {
    const ed = Editor.create(SOURCE);
    const entries = ed.read(LIST) as unknown[];
    const op = moveRuleOp(TABLE, entries, 0, 1);
    expect(op).not.toBeNull();
    expect(ed.apply(op as NonNullable<typeof op>).ok).toBe(true);
    const text = ed.text();
    expect(text).toMatch(/- when: \{ key: b \} # second\n\s+- when: \{ key: a \} # first\n/);
    ed.undo();
    expect(ed.text()).toBe(SOURCE);
  });
});

describe('MAX_ROW_CONDITIONS', () => {
  it('matches the engine cap it stands in for', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../../engine/core/src/template/table/row.rs'),
      'utf8',
    );
    const declared = /pub const MAX_ROW_CONDITIONAL_STYLES: usize = (\d+);/.exec(source);
    expect(Number(declared?.[1])).toBe(MAX_ROW_CONDITIONS);
  });
});
