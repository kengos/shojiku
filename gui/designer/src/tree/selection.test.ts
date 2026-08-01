// Tests for selection.ts — where the selection sits and goes: the
// breadcrumb chain over a segment-wise prefix match, the enclosing node,
// sequence length reads, and the post-remove selection.
import { describe, expect, it } from 'vitest';
import { buildTree } from './model';
import {
  breadcrumbChain,
  enclosingNodePath,
  nextSelectionAfterRemove,
  seqLength,
} from './selection';

const TEMPLATE = [
  'version: "0.1.0"',
  'sections:',
  '  header:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: 請求書',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: Hello world',
  '      - type: text',
  '        data: { key: order.code }',
  '      - type: rect',
  '        id: frame',
  '        box: { w: 100, h: 40 }',
  '      - type: container',
  '        items:',
  '          - type: text',
  '            text: inner',
  '      - type: table',
  '        data: { key: items }',
  '        columns:',
  '          - label: 品名',
  '            data: { key: name }',
  '          - data: { key: qty }',
  '          - cell:',
  '              items:',
  '                - type: text',
  '                  data: { key: price }',
  '      - type: repeat_flow',
  '        data: { key: cards }',
  '        item:',
  '          items:',
  '            - type: text',
  '              text: card',
  '      - type: repeat',
  '        data: { key: grid }',
  '        cell:',
  '          items:',
  '            - type: text',
  '              text: cellText',
  '  footer:',
  '    type: flow',
  '    items: []',
  '',
].join('\n');

describe('breadcrumbChain', () => {
  const view = buildTree(TEMPLATE);

  it('returns the root-to-node chain for an exact tree path', () => {
    const chain = breadcrumbChain(view, 'sections.body.items[4].columns[2].cell.items[0]');
    expect(chain.map((node) => node.path)).toEqual([
      'sections.body',
      'sections.body.items[4]',
      'sections.body.items[4].columns[2]',
      'sections.body.items[4].columns[2].cell.items[0]',
    ]);
  });

  it('does not mistake items[1] for a prefix of items[10]', () => {
    const chain = breadcrumbChain(view, 'sections.body.items[10]');
    expect(chain.map((node) => node.path)).toEqual(['sections.body']);
  });

  it('yields the longest covering prefix for a deeper-than-tree selection', () => {
    const chain = breadcrumbChain(view, 'sections.body.items[2].box');
    expect(chain.map((node) => node.path)).toEqual(['sections.body', 'sections.body.items[2]']);
  });

  it('is empty without a view, a selection, or any covering root', () => {
    expect(breadcrumbChain(null, 'sections.body')).toEqual([]);
    expect(breadcrumbChain(view, null)).toEqual([]);
    expect(breadcrumbChain(view, 'zzz')).toEqual([]);
  });
});

describe('enclosingNodePath', () => {
  it('strips the trailing sequence key to the container item', () => {
    expect(enclosingNodePath('sections.body.items[0].items')).toBe('sections.body.items[0]');
    expect(enclosingNodePath('sections.body.items[2].columns')).toBe('sections.body.items[2]');
  });

  it('strips to the section for a top-level body sequence', () => {
    expect(enclosingNodePath('sections.body.items')).toBe('sections.body');
  });

  it('is null for a bare top-level sequence key', () => {
    expect(enclosingNodePath('attachments')).toBeNull();
  });
});

describe('seqLength', () => {
  it('reads an array length through the reader', () => {
    expect(seqLength(() => [1, 2, 3], 'sections.body.items')).toBe(3);
  });

  it('is 0 when the node is not an array', () => {
    expect(seqLength(() => ({ a: 1 }), 'defaults')).toBe(0);
  });

  it('is 0 when the reader throws (an alias-bomb subtree)', () => {
    expect(
      seqLength(() => {
        throw new Error('alias bomb');
      }, 'sections.body.items'),
    ).toBe(0);
  });
});

describe('nextSelectionAfterRemove', () => {
  it('selects the next sibling shifted into the freed slot (middle delete)', () => {
    expect(nextSelectionAfterRemove('sections.body.items', 1, 3)).toBe('sections.body.items[1]');
  });

  it('selects the previous sibling when the removed item was last', () => {
    expect(nextSelectionAfterRemove('sections.body.items', 2, 3)).toBe('sections.body.items[1]');
  });

  it('selects the enclosing node when the sequence empties', () => {
    expect(nextSelectionAfterRemove('sections.body.items', 0, 1)).toBe('sections.body');
  });

  it('deselects (null) when a bare top-level sequence empties', () => {
    expect(nextSelectionAfterRemove('attachments', 0, 1)).toBeNull();
  });

  it('selects the enclosing container item when a nested sequence empties', () => {
    expect(nextSelectionAfterRemove('sections.body.items[0].items', 0, 1)).toBe(
      'sections.body.items[0]',
    );
  });
});
