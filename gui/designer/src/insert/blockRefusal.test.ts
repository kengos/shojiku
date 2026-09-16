// Tests for blockRefusal.ts — which owner refuses a whole saved block. The
// walk runs over a HOST-supplied prop the Designer does not sanitize, so the
// hostile cases here are the contract, not decoration: each one asserts the
// walk answers rather than throws, and each bound is paired with a control
// proving the walk still reaches what sits just inside it.
import type { SnippetValue } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { blockRefusedOwner } from './blockRefusal';

/** A block whose `items` list holds `count` texts and then one table. */
function listOf(count: number): SnippetValue {
  const items: unknown[] = [];
  for (let i = 0; i < count; i++) {
    items.push({ type: 'text', text: `t${i}` });
  }
  items.push({ type: 'table' });
  return { type: 'container', items } as SnippetValue;
}

describe('blockRefusedOwner', () => {
  it('names the cell for a table at any depth through items', () => {
    // A cell's refusal travels down the `items` chain: the engine's data scope
    // is not cleared by a container, so a table wrapped in one is skipped
    // exactly as a bare table is.
    const values: SnippetValue[] = [
      { type: 'table' },
      { type: 'container', items: [{ type: 'table' }] },
      {
        type: 'container',
        items: [{ type: 'text' }, { type: 'container', items: [{ type: 'table' }] }],
      },
    ];
    for (const value of values) {
      expect(blockRefusedOwner(value)).toBe('cell');
    }
  });

  it('refuses nothing for a block whose table is inside its OWN sub-template', () => {
    // Deliberate, and the reason the walk stops at `items`: such a table is
    // already skipped wherever the block lands, so refusing on it would say
    // "not here" about something no target fixes — and would leave a block the
    // user successfully SAVED insertable nowhere at all.
    for (const value of [
      { type: 'repeat', cell: { items: [{ type: 'table' }] } },
      { type: 'repeat_flow', item: { items: [{ type: 'table' }] } },
      // The same reasoning for the pre-existing case this does NOT close: a
      // container-wrapped page_number draws in no owner at all.
      { type: 'container', items: [{ type: 'page_number' }] },
    ] as SnippetValue[]) {
      expect(blockRefusedOwner(value)).toBeNull();
    }
    // The third sub-template, `columns[].cell:`, cannot be reached this way: it
    // exists only on a table, so such a block is refused by its ROOT type and
    // says nothing about the walk. Asserted rather than omitted, so the gap in
    // the list above is deliberate rather than missing.
    expect(
      blockRefusedOwner({
        type: 'table',
        columns: [{ cell: { items: [{ type: 'table' }] } }],
      } as SnippetValue),
    ).toBe('cell');
  });

  it('stops at the NODE budget, and reaches a table just inside it', () => {
    // The bound that does the work. A depth cap cannot stand in for it: the
    // walk re-reads per node, so a graph with shared sub-objects re-expands.
    expect(blockRefusedOwner(listOf(300))).toBeNull();
    // The control — without it the null above is indistinguishable from a walk
    // that never looked at a long list at all.
    expect(blockRefusedOwner(listOf(200))).toBe('cell');
  });

  it('stops at the DEPTH backstop, and reaches a table just inside it', () => {
    const nest = (levels: number): SnippetValue => {
      let node: Record<string, unknown> = { type: 'table' };
      for (let i = 0; i < levels; i++) {
        node = { type: 'container', items: [node] };
      }
      return node as SnippetValue;
    };
    expect(blockRefusedOwner(nest(40))).toBeNull();
    expect(blockRefusedOwner(nest(10))).toBe('cell');
  });

  it('answers rather than throwing for hostile shapes', () => {
    // A cycle terminates on the caps (this test hanging IS the failure mode it
    // pins); an inherited `items` is not the node's own; a non-array `items`
    // and non-map children are all "no children".
    const cyclic: Record<string, unknown> = { type: 'container' };
    cyclic.items = [cyclic];
    const inherited = Object.create({ items: [{ type: 'table' }] }) as Record<string, unknown>;
    inherited.type = 'container';
    for (const value of [
      cyclic,
      inherited,
      { type: 'container', items: 'nope' },
      { type: 'container', items: ['nope', null, [], 7] },
      undefined,
      null,
      'table',
      7,
      [{ type: 'table' }],
    ]) {
      expect(blockRefusedOwner(value)).toBeNull();
    }
    // The control for the two GUARDED cases above: the same table as an own
    // property one level in IS found, so the nulls are the guards doing their
    // job rather than the walk failing to look.
    expect(blockRefusedOwner({ type: 'container', items: [{ type: 'table' }] })).toBe('cell');
  });
});
