// Tests for frameModel.ts — recognizing the three sub-template frames by what
// the document says their owner IS, not by the key's spelling alone.
import { describe, expect, it } from 'vitest';
import { frameOf } from './frameModel';

const reader = (reads: Record<string, unknown>) => (path: string) => reads[path];

const REPEAT = 'sections.body.items[0]';

describe('frameOf', () => {
  it('names a repeat cell, a card and a column cell, with the owner to jump back to', () => {
    const read = reader({
      [REPEAT]: { type: 'repeat', cell: {} },
      [`${REPEAT}.cell`]: {},
      'sections.body.items[1]': { type: 'repeat_flow', item: {} },
      'sections.body.items[1].item': { items: [] },
      'sections.body.items[2]': { type: 'table', columns: [] },
      'sections.body.items[2].columns[0]': { label: 'A', cell: {} },
      'sections.body.items[2].columns[0].cell': {},
    });
    expect(frameOf(read, `${REPEAT}.cell`)).toEqual({ kind: 'cell', ownerPath: REPEAT });
    expect(frameOf(read, 'sections.body.items[1].item')).toEqual({
      kind: 'card',
      ownerPath: 'sections.body.items[1]',
    });
    expect(frameOf(read, 'sections.body.items[2].columns[0].cell')).toEqual({
      kind: 'columnCell',
      ownerPath: 'sections.body.items[2].columns[0]',
    });
  });

  it('refuses a frame key under an owner that does not read it', () => {
    const read = reader({
      // A `cell:` under a container, an `item:` under a repeat, a `cell:` under
      // a repeat_flow, and an `item:` under a column: none is a frame.
      [REPEAT]: { type: 'container', cell: {} },
      [`${REPEAT}.cell`]: {},
      'sections.body.items[1]': { type: 'repeat', item: {} },
      'sections.body.items[1].item': {},
      'sections.body.items[2]': { type: 'repeat_flow', cell: {} },
      'sections.body.items[2].cell': {},
      'sections.body.items[3]': { type: 'table' },
      'sections.body.items[3].columns[0]': { item: {} },
      'sections.body.items[3].columns[0].item': {},
      // A `columns:` list on something that is not a table: not a column cell.
      'sections.body.items[4]': { type: 'container' },
      'sections.body.items[4].columns[0]': { cell: {} },
      'sections.body.items[4].columns[0].cell': {},
      // ... or with no readable table above it at all.
      'sections.body.items[5].columns[0]': { cell: {} },
      'sections.body.items[5].columns[0].cell': {},
    });
    expect(frameOf(read, `${REPEAT}.cell`)).toBeNull();
    expect(frameOf(read, 'sections.body.items[1].item')).toBeNull();
    expect(frameOf(read, 'sections.body.items[2].cell')).toBeNull();
    expect(frameOf(read, 'sections.body.items[3].columns[0].item')).toBeNull();
    expect(frameOf(read, 'sections.body.items[4].columns[0].cell')).toBeNull();
    expect(frameOf(read, 'sections.body.items[5].columns[0].cell')).toBeNull();
  });

  it('refuses a frame that is not a map, or an owner that is not one', () => {
    const read = reader({
      [REPEAT]: { type: 'repeat', cell: 'oops' },
      [`${REPEAT}.cell`]: 'oops',
      'sections.body.items[1]': ['not', 'a', 'map'],
      'sections.body.items[1].cell': {},
    });
    expect(frameOf(read, `${REPEAT}.cell`)).toBeNull();
    expect(frameOf(read, 'sections.body.items[1].cell')).toBeNull();
  });

  it('refuses paths that are not shaped like a frame, and survives a throwing read', () => {
    const read = reader({ 'grid[0][1]': { type: 'repeat' }, 'grid[0][1].cell': {} });
    expect(frameOf(read, 'sections.body')).toBeNull();
    expect(frameOf(read, 'sections.body.cell')).toBeNull();
    expect(frameOf(read, `${REPEAT}`)).toBeNull();
    expect(frameOf(read, 'not a path')).toBeNull();
    // An index where the list key would be: still a repeat cell by its owner.
    expect(frameOf(read, 'grid[0][1].cell')).toEqual({ kind: 'cell', ownerPath: 'grid[0][1]' });
    const throwing = () => {
      throw new Error('alias bomb');
    };
    expect(frameOf(throwing, `${REPEAT}.cell`)).toBeNull();
  });
});
