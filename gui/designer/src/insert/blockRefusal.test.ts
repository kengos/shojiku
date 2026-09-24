// Tests for blockRefusal.ts — which owner refuses a whole saved block, and
// whether a block holds an item that draws under no target at all. The
// walk runs over a HOST-supplied prop the Designer does not sanitize, so the
// hostile cases here are the contract, not decoration: each one asserts the
// walk answers rather than throws, and each bound is paired with a control
// proving the walk still reaches what sits just inside it.
import type { SnippetValue } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { blockNeverDraws, blockRefusedOwner } from './blockRefusal';

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

const RESTRICTED = ['page_number', 'page_break', 'repeat', 'repeat_flow'] as const;

/** A block whose `items` list holds `count` texts and then one page number. */
function deadListOf(count: number): SnippetValue {
  const items: unknown[] = [];
  for (let i = 0; i < count; i++) {
    items.push({ type: 'text', text: `t${i}` });
  }
  items.push({ type: 'page_number' });
  return { type: 'container', items } as SnippetValue;
}

describe('blockNeverDraws', () => {
  it('flags every restricted kind wrapped in a container, at any depth', () => {
    for (const type of RESTRICTED) {
      expect(blockNeverDraws({ type: 'container', items: [{ type }] }), type).toBe(true);
      expect(
        blockNeverDraws({
          type: 'container',
          items: [{ type: 'text' }, { type: 'container', items: [{ type }] }],
        }),
        `${type} two deep`,
      ).toBe(true);
    }
  });

  it('flags a restricted kind inside each of the three sub-templates', () => {
    // Unlike `blockRefusedOwner`, this walk goes INTO them: an item there is a
    // cell's child, which no target makes draw.
    for (const type of RESTRICTED) {
      const values: unknown[] = [
        { type: 'repeat', data: { key: 'rows' }, cell: { items: [{ type }] } },
        { type: 'repeat_flow', data: { key: 'rows' }, item: { items: [{ type }] } },
        {
          type: 'table',
          data: { key: 'rows' },
          // The SECOND column, so a walk that read only `columns[0]` fails.
          columns: [{ label: 'A' }, { label: 'B', cell: { items: [{ type }] } }],
        },
        // Through a container inside a sub-template.
        {
          type: 'repeat',
          cell: { items: [{ type: 'container', items: [{ type }] }] },
        },
      ];
      for (const value of values) {
        expect(blockNeverDraws(value), `${type} in ${JSON.stringify(value)}`).toBe(true);
      }
    }
  });

  it("flags a table inside the block's OWN sub-template, but not one merely wrapped", () => {
    // A sub-template's data scope is never cleared below it, so a table there is
    // skipped (`table_in_cell`) whatever the target — through a container too.
    // Outside one, a wrapped table draws everywhere but a cell target, which is
    // `refuses`, not this.
    for (const value of [
      { type: 'repeat', cell: { items: [{ type: 'table' }] } },
      { type: 'repeat_flow', item: { items: [{ type: 'table' }] } },
      {
        type: 'table',
        columns: [{ label: 'A' }, { label: 'B', cell: { items: [{ type: 'table' }] } }],
      },
      { type: 'repeat', cell: { items: [{ type: 'container', items: [{ type: 'table' }] }] } },
      { type: 'container', items: [{ type: 'repeat', cell: { items: [{ type: 'table' }] } }] },
    ]) {
      expect(blockNeverDraws(value), JSON.stringify(value)).toBe(true);
    }
    // The control: the same table outside any sub-template, at two depths.
    expect(blockNeverDraws({ type: 'container', items: [{ type: 'table' }] })).toBe(false);
    expect(
      blockNeverDraws({
        type: 'container',
        items: [{ type: 'container', items: [{ type: 'table' }] }],
      }),
    ).toBe(false);
  });

  it('never flags the ROOT, a clean block, or a wrapped table', () => {
    // A bare restricted kind draws in its one owner — that is `requires`, and
    // target-dependent. A wrapped table is `refuses` (it draws outside a cell).
    for (const type of RESTRICTED) {
      expect(blockNeverDraws({ type }), type).toBe(false);
    }
    for (const value of [
      { type: 'container', items: [{ type: 'text' }, { type: 'container', items: [] }] },
      { type: 'container', items: [{ type: 'table' }] },
      { type: 'repeat', cell: { items: [{ type: 'text' }] } },
      { type: 'table', columns: [{ label: 'A', cell: { items: [{ type: 'image' }] } }] },
      { type: 'text' },
    ]) {
      expect(blockNeverDraws(value), JSON.stringify(value)).toBe(false);
    }
  });

  it('stops at the NODE budget, and reaches an item just inside it', () => {
    expect(blockNeverDraws(deadListOf(300))).toBe(false);
    expect(blockNeverDraws(deadListOf(200))).toBe(true);
  });

  it('charges cell-less COLUMNS to the budget, and reaches a cell just inside it', () => {
    // A column that yields no child still costs a node: a cell-less `columns`
    // array shared by every node would otherwise be re-scanned whole per visit.
    const table = (blank: number) => ({
      type: 'table',
      columns: [
        ...Array.from({ length: blank }, (_, i) => ({ label: `c${i}` })),
        { label: 'last', cell: { items: [{ type: 'page_number' }] } },
      ],
    });
    expect(blockNeverDraws(table(10_000))).toBe(false);
    expect(blockNeverDraws(table(200))).toBe(true);
  });

  it('stops at the DEPTH backstop, and reaches an item just inside it', () => {
    const nest = (levels: number): SnippetValue => {
      let node: Record<string, unknown> = { type: 'page_number' };
      for (let i = 0; i < levels; i++) {
        node = { type: 'container', items: [node] };
      }
      return node as SnippetValue;
    };
    expect(blockNeverDraws(nest(40))).toBe(false);
    expect(blockNeverDraws(nest(10))).toBe(true);
    // The exact boundary: the deepest level inspected is 24, as in the refusal.
    expect(blockNeverDraws(nest(24))).toBe(true);
    expect(blockNeverDraws(nest(25))).toBe(false);
  });

  it('answers rather than throwing for hostile shapes', () => {
    // A cycle — through `items` and through a sub-template — terminates on the
    // caps (a hang IS the failure). Every INHERITED key is not the node's own:
    // `items`, `cell`, `item`, `columns`, a column's `cell`, and the child's
    // `type`. Wrong-typed containers are "no children".
    const cyclic: Record<string, unknown> = { type: 'container' };
    cyclic.items = [cyclic];
    // Typed `container`, not `repeat`: a repeat nested in its own cell IS a
    // never-drawing item, and the walk would rightly stop there on the first hop.
    const cyclicCell: Record<string, unknown> = { type: 'container' };
    cyclicCell.cell = { items: [cyclicCell] };
    const inheriting = (proto: object) => {
      const node = Object.create(proto) as Record<string, unknown>;
      node.type = 'container';
      return node;
    };
    const dead = [{ type: 'page_number' }];
    const inheritedColumnCell = Object.create({ cell: { items: dead } }) as object;
    const inheritedType = Object.create({ type: 'page_number' }) as object;
    for (const value of [
      cyclic,
      cyclicCell,
      inheriting({ items: dead }),
      inheriting({ cell: { items: dead } }),
      inheriting({ item: { items: dead } }),
      inheriting({ columns: [{ cell: { items: dead } }] }),
      { type: 'table', columns: [inheritedColumnCell] },
      { type: 'container', items: [inheritedType] },
      { type: 'container', items: 'nope' },
      { type: 'repeat', cell: 'nope' },
      { type: 'repeat', cell: [dead] },
      { type: 'table', columns: 'nope' },
      { type: 'table', columns: ['nope', null, 7, []] },
      { type: 'container', items: ['nope', null, [], 7] },
      undefined,
      null,
      'page_number',
      7,
      [{ type: 'container', items: dead }],
    ]) {
      expect(blockNeverDraws(value)).toBe(false);
    }
    // The control for the guarded cases: the same shapes as OWN properties are
    // found, so the falses above are the guards, not a walk that never looked.
    expect(blockNeverDraws({ type: 'container', items: dead })).toBe(true);
    expect(blockNeverDraws({ type: 'repeat', cell: { items: dead } })).toBe(true);
    expect(blockNeverDraws({ type: 'repeat_flow', item: { items: dead } })).toBe(true);
    expect(blockNeverDraws({ type: 'table', columns: [{ cell: { items: dead } }] })).toBe(true);
  });
});
