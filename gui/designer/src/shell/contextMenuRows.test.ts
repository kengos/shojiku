import { describe, expect, it } from 'vitest';
import {
  borderableView,
  type ContextRowsInput,
  contextMenuRows,
  readNodeAt,
} from './contextMenuRows';

const TEXT_ITEM = { type: 'text', text: 'second' };
const ITEM_PATH = 'sections.body.items[1]';

function kinds(over: Partial<ContextRowsInput> = {}): readonly string[] {
  return contextMenuRows({
    node: TEXT_ITEM,
    path: ITEM_PATH,
    blockArmed: true,
    capabilities: undefined,
    ...over,
  }).map((row) => row.kind);
}

describe('contextMenuRows', () => {
  it('offers every row in menu order for an armed, borderable sequence item', () => {
    expect(kinds()).toEqual(['duplicate', 'delete', 'wrap', 'border', 'saveBlock']);
  });

  it('withholds duplicate and delete from a path that is not a sequence entry', () => {
    expect(kinds({ path: 'sections.body' })).toEqual(['border', 'saveBlock']);
  });

  it('withholds the save-block row when the host never wired blocks', () => {
    expect(kinds({ blockArmed: false })).toEqual(['duplicate', 'delete', 'wrap', 'border']);
  });

  it('gates the border row on the engine capability', () => {
    expect(kinds({ capabilities: [] })).toEqual(['duplicate', 'delete', 'wrap', 'saveBlock']);
    expect(kinds({ capabilities: ['style.border'] })).toContain('border');
  });

  it('offers no border row for a type that cannot carry one, prototype names included', () => {
    expect(kinds({ node: { type: 'constructor' } })).not.toContain('border');
    expect(kinds({ node: { type: 'page_break' } })).not.toContain('border');
  });

  it('derives rows from an unreadable node without throwing', () => {
    // The node-shaped rows go; the path-shaped ones stay.
    expect(kinds({ node: undefined })).toEqual(['duplicate', 'delete', 'wrap']);
  });

  it('carries the snippet on the save-block row, captured from the node', () => {
    const rows = contextMenuRows({
      node: TEXT_ITEM,
      path: ITEM_PATH,
      blockArmed: true,
      capabilities: undefined,
    });
    const saveBlock = rows.find((row) => row.kind === 'saveBlock');
    expect(saveBlock).toEqual({ kind: 'saveBlock', block: TEXT_ITEM });
  });
});

describe('readNodeAt', () => {
  it('reads the node at the path', () => {
    expect(readNodeAt(() => TEXT_ITEM, ITEM_PATH)).toBe(TEXT_ITEM);
  });

  it('degrades a throwing read to undefined — a menu is never a reason to crash', () => {
    expect(
      readNodeAt(() => {
        throw new Error('alias bomb');
      }, ITEM_PATH),
    ).toBeUndefined();
  });
});

describe('borderableView', () => {
  it('returns the view itself, so the popover need not re-derive it', () => {
    expect(borderableView({ type: 'table' }, undefined)?.type).toBe('table');
  });

  it('is null without the capability, and for a non-map node', () => {
    expect(borderableView({ type: 'table' }, [])).toBeNull();
    expect(borderableView('not an item', undefined)).toBeNull();
  });
});
