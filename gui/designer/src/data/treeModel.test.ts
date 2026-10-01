import { describe, expect, it } from 'vitest';
import { readBindings } from '../palette/bindings';
import { buildUsage } from '../palette/usage';
import { type DefsNode, readDefsTree } from './defsTree';
import { SELECTION_SEP } from './editorModel';
import {
  addTargets,
  ancestry,
  defaultAddTarget,
  filterTree,
  findNode,
  nodeForTarget,
  nodeLabel,
  nodeUsage,
  parentOf,
  sampleSpot,
} from './treeModel';

const DEFS = `type: object
properties:
  total:
    type: number
    title: 合計
  customer:
    type: object
    title: 取引先
    properties:
      name:
        type: string
  order:
    type: object
    properties:
      lines:
        type: array
        items:
          type: object
          properties:
            sku: { type: string }
  items:
    type: array
    title: 明細
    items:
      type: object
      properties:
        qty: { type: number }
        tags:
          type: array
          items:
            type: object
            properties:
              word: { type: string }
  notes:
    type: array
    items: { type: string }
`;

const TEMPLATE = `sections:
  body:
    type: flow
    items:
      - { type: text, data: { key: total } }
      - { type: text, text: "{customer.name} 様" }
      - type: table
        data: { key: items }
        columns:
          - { data: { key: qty } }
      - type: table
        data: { key: order.lines }
        columns:
          - { data: { key: sku } }
      - { type: list, data: { key: notes } }
`;

function tree(): DefsNode {
  const root = readDefsTree(DEFS);
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

const ITEMS = ['properties', 'items'];
const QTY = [...ITEMS, 'items', 'properties', 'qty'];
const WORD = [...ITEMS, 'items', 'properties', 'tags', 'items', 'properties', 'word'];

describe('findNode / nodeLabel', () => {
  it('finds by id and answers null for an id the tree does not hold', () => {
    expect(findNode(tree(), '')?.kind).toBe('root');
    expect(findNode(tree(), 'nope')).toBeNull();
  });

  it('shows the label, else the data name', () => {
    expect(nodeLabel(at('properties', 'total'))).toBe('合計');
    expect(nodeLabel(at('properties', 'customer', 'properties', 'name'))).toBe('name');
  });
});

describe('nodeUsage', () => {
  const usage = buildUsage(readBindings(TEMPLATE));

  it('counts a document-scope field by its full key, interpolations included', () => {
    expect(nodeUsage(usage, at('properties', 'total'))).toHaveLength(1);
    expect(nodeUsage(usage, at('properties', 'customer', 'properties', 'name'))).toHaveLength(1);
  });

  it('counts a table or list as a document-scope SOURCE', () => {
    expect(nodeUsage(usage, at(...ITEMS))).toHaveLength(1);
    expect(nodeUsage(usage, at('properties', 'notes'))).toHaveLength(1);
    expect(nodeUsage(usage, at('properties', 'order', 'properties', 'lines'))).toHaveLength(1);
  });

  it('counts a row field row-relatively under its own table', () => {
    expect(nodeUsage(usage, at(...QTY))).toHaveLength(1);
    expect(
      nodeUsage(
        usage,
        at('properties', 'order', 'properties', 'lines', 'items', 'properties', 'sku'),
      ),
    ).toHaveLength(1);
  });

  it('reads an unbound node as [] and the root / a group as no usage at all', () => {
    expect(nodeUsage(usage, at(...WORD))).toEqual([]);
    expect(nodeUsage(usage, at(...ITEMS, 'items', 'properties', 'tags'))).toEqual([]);
    expect(nodeUsage(usage, tree())).toBeNull();
    expect(nodeUsage(usage, at('properties', 'customer'))).toBeNull();
  });
});

describe('nodeForTarget', () => {
  it('resolves a palette jump at document scope by the full key', () => {
    expect(nodeForTarget(tree(), { group: '', key: 'total' })?.name).toBe('total');
    expect(nodeForTarget(tree(), { group: 'customer', key: 'customer.name' })?.name).toBe('name');
  });

  it('resolves an array group jump by the row-relative key under that array', () => {
    expect(nodeForTarget(tree(), { group: 'items', key: 'qty' })?.keysPath).toEqual(QTY);
    expect(nodeForTarget(tree(), { group: 'items.tags', key: 'word' })?.keysPath).toEqual(WORD);
    expect(nodeForTarget(tree(), { group: 'order.lines', key: 'sku' })?.name).toBe('sku');
  });

  it('resolves nothing for a stale or hostile target', () => {
    expect(nodeForTarget(tree(), { group: '', key: 'gone' })).toBeNull();
    // A row field is not reachable as a document-scope key, and vice versa.
    expect(nodeForTarget(tree(), { group: '', key: 'qty' })).toBeNull();
    expect(nodeForTarget(tree(), { group: 'items', key: 'total' })).toBeNull();
    expect(nodeForTarget(tree(), { group: '__proto__', key: 'constructor' })).toBeNull();
  });
});

describe('filterTree', () => {
  it('returns the tree itself for a blank query', () => {
    const root = tree();
    expect(filterTree(root, '  ')).toBe(root);
  });

  it('keeps a match with its ancestors, case-insensitively, on label or data name', () => {
    const shown = filterTree(tree(), 'QTY');
    expect(shown.children.map((child) => child.name)).toEqual(['items']);
    expect(shown.children[0]?.children.map((child) => child.name)).toEqual(['qty']);
    expect(filterTree(tree(), '取引').children.map((child) => child.name)).toEqual(['customer']);
  });

  it('keeps a matching container whole', () => {
    expect(filterTree(tree(), '明細').children[0]?.children).toHaveLength(2);
  });

  it('matches the full dotted data name and treats the query as plain text', () => {
    expect(filterTree(tree(), 'order.lines').children.map((child) => child.name)).toEqual([
      'order',
    ]);
    expect(filterTree(tree(), '.*').children).toEqual([]);
  });
});

describe('addTargets / defaultAddTarget', () => {
  it('offers the root, groups and tables — never a field or a list', () => {
    expect(addTargets(tree()).map((node) => node.dataPath.join('.'))).toEqual([
      '',
      'customer',
      'order',
      'order.lines',
      'items',
      'items.tags',
    ]);
  });

  it('starts at the selected container, the selected item container, or the root', () => {
    const root = tree();
    expect(defaultAddTarget(root, null)).toBe(root);
    expect(defaultAddTarget(root, at(...ITEMS)).id).toBe(at(...ITEMS).id);
    expect(defaultAddTarget(root, at(...QTY)).id).toBe(at(...ITEMS).id);
    expect(defaultAddTarget(root, at('properties', 'notes')).id).toBe('');
    expect(defaultAddTarget(root, root)).toBe(root);
  });
});

describe('parentOf / ancestry', () => {
  it('names the containers from the top down to a node', () => {
    expect(ancestry(tree(), at(...WORD)).map((node) => node.name)).toEqual([
      'items',
      'tags',
      'word',
    ]);
    expect(ancestry(tree(), at('properties', 'total')).map((node) => node.name)).toEqual(['total']);
    expect(ancestry(tree(), tree())).toEqual([]);
  });

  it('answers null for the root and stops at a node the tree does not hold', () => {
    expect(parentOf(tree(), tree())).toBeNull();
    const stray: DefsNode = { ...at('properties', 'total'), id: 'stray' };
    expect(parentOf(tree(), stray)).toBeNull();
    expect(ancestry(tree(), stray)).toEqual([stray]);
  });
});

describe('sampleSpot', () => {
  it('puts a document-scope field at its data path', () => {
    expect(sampleSpot(tree(), at('properties', 'customer', 'properties', 'name'))).toEqual({
      kind: 'single',
      path: ['customer', 'name'],
    });
  });

  it('puts a row field in each row of its table, also under an object', () => {
    expect(sampleSpot(tree(), at(...QTY))).toEqual({
      kind: 'rows',
      arrayPath: ['items'],
      rel: ['qty'],
    });
    expect(
      sampleSpot(
        tree(),
        at('properties', 'order', 'properties', 'lines', 'items', 'properties', 'sku'),
      ),
    ).toEqual({ kind: 'rows', arrayPath: ['order', 'lines'], rel: ['sku'] });
  });

  it('answers none for a table nested in another table rows', () => {
    expect(sampleSpot(tree(), at(...WORD))).toEqual({ kind: 'none' });
  });
});
