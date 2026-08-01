import type { SnippetValue } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  addBlock,
  blockFromNode,
  blockInsertGroup,
  MAX_BLOCK_NAME_CHARS,
  MAX_BLOCKS,
  removeBlock,
  type SavedBlock,
  sanitizeBlocks,
  validateBlockName,
} from './blockModel';

const CONTAINER: SnippetValue = { type: 'container', items: [{ type: 'text', text: 'a' }] };

function block(id: string, name: string, value: SnippetValue = CONTAINER): SavedBlock {
  return { id, name, value };
}

describe('blockFromNode', () => {
  it('returns the value for a plain item map within caps', () => {
    expect(blockFromNode(CONTAINER)).toEqual(CONTAINER);
  });

  it('returns null for a missing read, a leaf, or an array', () => {
    expect(blockFromNode(undefined)).toBeNull();
    expect(blockFromNode(null)).toBeNull();
    expect(blockFromNode('text')).toBeNull();
    expect(blockFromNode(42)).toBeNull();
    expect(blockFromNode([{ type: 'text' }])).toBeNull();
  });

  it('returns null for a map over the snippet node cap', () => {
    const huge: Record<string, number> = {};
    for (let i = 0; i < 300; i++) {
      huge[`k${i}`] = i;
    }
    expect(blockFromNode(huge)).toBeNull();
  });
});

describe('validateBlockName', () => {
  it('accepts a fresh non-empty name', () => {
    expect(validateBlockName('社判', [])).toBeNull();
  });

  it('rejects an empty / whitespace-only name', () => {
    expect(validateBlockName('', [])).toBe('empty_name');
    expect(validateBlockName('   ', [])).toBe('empty_name');
  });

  it('rejects an over-cap name', () => {
    expect(validateBlockName('x'.repeat(MAX_BLOCK_NAME_CHARS + 1), [])).toBe('name_too_long');
  });

  it('rejects a duplicate name (trimmed, case-sensitive)', () => {
    expect(validateBlockName(' 社判 ', [block('block-1', '社判')])).toBe('name_exists');
  });
});

describe('addBlock', () => {
  it('appends a fresh-id block on a valid name', () => {
    const out = addBlock([], '社判＋住所', CONTAINER);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.blocks).toHaveLength(1);
      expect(out.block).toEqual({ id: 'block-1', name: '社判＋住所', value: CONTAINER });
    }
  });

  it('mints the next id past the taken ones', () => {
    const out = addBlock([block('block-1', 'a')], 'b', CONTAINER);
    expect(out.ok && out.block.id).toBe('block-2');
  });

  it('mints the smallest free id after a delete', () => {
    const after = removeBlock([block('block-1', 'a'), block('block-2', 'b')], 'block-1');
    const out = addBlock(after, 'c', CONTAINER);
    expect(out.ok && out.block.id).toBe('block-1');
  });

  it('returns the name refusal', () => {
    const out = addBlock([], '', CONTAINER);
    expect(out.ok === false && out.refusal).toBe('empty_name');
  });

  it('refuses when the library is full', () => {
    const full = Array.from({ length: MAX_BLOCKS }, (_, i) => block(`block-${i + 1}`, `n${i}`));
    const out = addBlock(full, 'one more', CONTAINER);
    expect(out.ok === false && out.refusal).toBe('over_cap');
  });
});

describe('removeBlock', () => {
  it('drops the matching id and no-ops a miss', () => {
    const list = [block('block-1', 'a'), block('block-2', 'b')];
    expect(removeBlock(list, 'block-1').map((b) => b.id)).toEqual(['block-2']);
    expect(removeBlock(list, 'nope')).toHaveLength(2);
  });
});

describe('sanitizeBlocks', () => {
  it('returns an empty library for non-array input', () => {
    expect(sanitizeBlocks(null)).toEqual([]);
    expect(sanitizeBlocks({ blocks: [] })).toEqual([]);
  });

  it('keeps valid entries and strips control chars from the name', () => {
    const out = sanitizeBlocks([{ id: 'block-1', name: 'a\u0000b\u007f', value: CONTAINER }]);
    expect(out).toEqual([{ id: 'block-1', name: 'ab', value: CONTAINER }]);
  });

  it('drops malformed entries: non-object, bad/dup/reserved id, bad name, non-snippet', () => {
    const out = sanitizeBlocks([
      'not-an-object',
      { id: 'block-1', name: 'ok', value: CONTAINER },
      { id: 'block-1', name: 'dup id', value: CONTAINER },
      { id: '', name: 'empty id', value: CONTAINER },
      { id: '__proto__', name: 'reserved', value: CONTAINER },
      { id: 'block-2', name: 42, value: CONTAINER },
      { id: 'block-3', name: '\u0000', value: CONTAINER },
      { id: 'block-4', name: 'bad value', value: () => 'x' },
    ]);
    expect(out).toEqual([{ id: 'block-1', name: 'ok', value: CONTAINER }]);
  });

  it('drops the over-cap tail', () => {
    const raw = Array.from({ length: MAX_BLOCKS + 5 }, (_, i) => ({
      id: `block-${i + 1}`,
      name: `n${i}`,
      value: CONTAINER,
    }));
    expect(sanitizeBlocks(raw)).toHaveLength(MAX_BLOCKS);
  });
});

describe('blockInsertGroup', () => {
  it('carries only the save entry for an empty library', () => {
    const group = blockInsertGroup([]);
    expect(group.labelKey).toBe('insert.group.reuseBlock');
    expect(group.entries).toEqual([{ kind: 'saveBlock', labelKey: 'insert.saveBlock' }]);
  });

  it('carries save + one row per block + manage for a non-empty library', () => {
    const group = blockInsertGroup([block('block-1', '社判'), block('block-2', '枠')]);
    expect(group.entries).toEqual([
      { kind: 'saveBlock', labelKey: 'insert.saveBlock' },
      { kind: 'block', blockId: 'block-1', name: '社判' },
      { kind: 'block', blockId: 'block-2', name: '枠' },
      { kind: 'manageBlock', labelKey: 'insert.manageBlock' },
    ]);
  });
});
