import { describe, expect, it } from 'vitest';
import { type DefsNode, MAX_TREE_NODES, readDefsTree } from './defsTree';
import { SELECTION_SEP } from './editorModel';
import { findNode, flattenTree } from './treeModel';

const DEFS = `type: object
title: 請求書データ
required: [total, items]
properties:
  total:
    type: number
    format: currency
    title: 合計
  customer:
    type: object
    title: 取引先
    required: [name]
    properties:
      name:
        type: string
        title: 宛名
      address:
        type: object
        properties:
          city:
            type: string
  items:
    type: array
    title: 明細
    items:
      type: object
      required: [qty]
      properties:
        qty:
          type: number
        tags:
          type: array
          items:
            type: object
            properties:
              word:
                type: string
  notes:
    type: array
    items:
      type: string
`;

function tree(text = DEFS): DefsNode {
  const root = readDefsTree(text);
  if (root === null) {
    throw new Error('fixture should parse');
  }
  return root;
}

function at(...keys: string[]): DefsNode {
  const found = findNode(tree(), keys.join(SELECTION_SEP));
  if (found === null) {
    throw new Error(`no node ${keys.join('.')}`);
  }
  return found;
}

describe('readDefsTree', () => {
  it('reads the root with its title and its top-level items in document order', () => {
    const root = tree();
    expect(root.kind).toBe('root');
    expect(root.id).toBe('');
    expect(root.label).toBe('請求書データ');
    expect(root.requiredListPath).toBeNull();
    expect(root.children.map((child) => [child.name, child.kind])).toEqual([
      ['total', 'field'],
      ['customer', 'group'],
      ['items', 'table'],
      ['notes', 'list'],
    ]);
  });

  it('classifies an array of objects as a table and an array of values as a list', () => {
    expect(at('properties', 'items').kind).toBe('table');
    expect(at('properties', 'notes').kind).toBe('list');
    // A list has nothing to open: its element is not a set of fields.
    expect(at('properties', 'notes').children).toEqual([]);
  });

  it('records each node keys path WHILE walking — groups, table rows, nested objects', () => {
    expect(
      at('properties', 'customer', 'properties', 'address', 'properties', 'city').dataPath,
    ).toEqual(['customer', 'address', 'city']);
    expect(at('properties', 'items', 'items', 'properties', 'qty').keysPath).toEqual([
      'properties',
      'items',
      'items',
      'properties',
      'qty',
    ]);
  });

  it('addresses a field of a table nested in another table ROWS through both rows', () => {
    // The old palette-id derivation dropped the outer table's `items` here and
    // edited a node that does not exist.
    const word = at(
      'properties',
      'items',
      'items',
      'properties',
      'tags',
      'items',
      'properties',
      'word',
    );
    expect(word.keysPath).toEqual([
      'properties',
      'items',
      'items',
      'properties',
      'tags',
      'items',
      'properties',
      'word',
    ]);
    expect(word.scope).toEqual(['items', 'tags']);
  });

  it('marks required from the PARENT list — root, group and table row', () => {
    expect(at('properties', 'total').required).toBe(true);
    expect(at('properties', 'customer').required).toBe(false);
    expect(at('properties', 'items').required).toBe(true);
    expect(at('properties', 'customer', 'properties', 'name').required).toBe(true);
    expect(at('properties', 'items', 'items', 'properties', 'qty').required).toBe(true);
    expect(at('properties', 'items', 'items', 'properties', 'qty').requiredListPath).toEqual([
      'properties',
      'items',
      'items',
      'required',
    ]);
  });

  it('opens a row scope at a table and keeps it through a group inside the rows', () => {
    expect(at('properties', 'total').scope).toBeNull();
    expect(at('properties', 'customer', 'properties', 'name').scope).toBeNull();
    expect(at('properties', 'items').scope).toBeNull();
    expect(at('properties', 'items', 'items', 'properties', 'qty').scope).toEqual(['items']);
  });

  it('gives a field its palette leaf (label fallback, type, enum options) and a container none', () => {
    expect(at('properties', 'total').leaf).toMatchObject({ label: '合計', type: 'currency' });
    expect(
      at('properties', 'customer', 'properties', 'address', 'properties', 'city').leaf?.label,
    ).toBe('city');
    expect(at('properties', 'customer').leaf).toBeNull();
  });

  it('reads `null` for text that is not a definitions map with properties', () => {
    for (const text of [
      '',
      ': : bad',
      '- a\n- b',
      'groups: []\n',
      'type: object\nproperties: 7\n',
    ]) {
      expect(readDefsTree(text)).toBeNull();
    }
  });

  it('reads a map with no properties as an EMPTY dictionary (the engine defaults it)', () => {
    const root = readDefsTree('type: object\ntitle: 空\n');
    expect(root?.kind).toBe('root');
    expect(root?.label).toBe('空');
    expect(root?.children).toEqual([]);
  });

  it('treats prototype names as ordinary own keys and never throws on hostile shapes', () => {
    const hostile = readDefsTree(
      '{"type":"object","required":"nope","properties":{"__proto__":{"type":"string"},"constructor":{"type":"object","properties":7},"toString":5,"x":{"type":"array","items":"y"}}}',
    );
    expect(hostile?.children.map((child) => [child.name, child.kind])).toEqual([
      ['__proto__', 'field'],
      ['constructor', 'group'],
      ['x', 'list'],
    ]);
    expect(hostile?.children[1]?.children).toEqual([]);
    expect(hostile?.children[0]?.required).toBe(false);
  });

  it('reads `null` for an alias bomb rather than expanding it', () => {
    const lines = ['a0: &a0 [x, x, x, x, x, x, x, x, x, x]'];
    for (let i = 1; i < 12; i++) {
      const prev = `*a${i - 1}`;
      lines.push(`a${i}: &a${i} [${Array.from({ length: 10 }, () => prev).join(', ')}]`);
    }
    lines.push('type: object', 'properties: { bomb: { type: string, example: *a11 } }');
    expect(readDefsTree(lines.join('\n'))).toBeNull();
  });

  it('stops descending past the walk depth cap', () => {
    let text = 'type: object\nproperties:\n';
    let indent = '  ';
    for (let depth = 0; depth < 40; depth++) {
      text += `${indent}g${depth}:\n${indent}  type: object\n${indent}  properties:\n`;
      indent += '    ';
    }
    text += `${indent}leaf: { type: string }\n`;
    const all = flattenTree(tree(text));
    expect(all.some((node) => node.name === 'leaf')).toBe(false);
    expect(all.length).toBeGreaterThan(30);
  });

  it('shows at most MAX_TREE_NODES nodes', () => {
    const fields = Array.from(
      { length: MAX_TREE_NODES + 5 },
      (_, i) => `  f${i}: { type: string }`,
    );
    const root = tree(`type: object\nproperties:\n${fields.join('\n')}\n`);
    expect(root.children).toHaveLength(MAX_TREE_NODES);
  });
});
