// The id namespace walk: one case per HOLDER kind (an item in each section, a
// nested container child, a table column, a column's cell frame and its item,
// a repeat's cell frame, a repeat_flow's card frame) and per REFERENCE spelling
// (an ellipse's `anchor`, a line's `from.item` / `to.item`), plus the hostile
// shapes the walk must survive without deciding anything from them.

import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { MAX_TREE_DEPTH } from '../tree/model';
import { buildIdIndex, holdersOf, refsTo, subtreeIndex } from './idIndex';
import { MAX_ID_WALK_NODES } from './walk';

const DOC = `
sections:
  header:
    items:
      - { type: text, id: head, text: Title }
  body:
    items:
      - type: container
        id: box
        items:
          - { type: text, id: total, data: { key: order.total } }
          - { type: ellipse, anchor: total }
      - type: table
        id: lines
        data: { key: lines }
        columns:
          - { id: qty, label: Qty, data: { key: qty } }
          - label: Note
            cell:
              id: note_cell
              items:
                - { type: text, id: note_text, data: { key: note } }
      - type: repeat
        data: { key: tickets }
        cell:
          id: ticket
          items:
            - { type: rect, id: stub }
      - type: repeat_flow
        data: { key: cards }
        item:
          id: card
          items: []
      - type: line
        from: { item: head, edge: bottom }
        to: { item: total }
      - { type: page_break, id: brk }
  footer:
    items:
      - { type: page_number, id: pn }
`;

const index = () => buildIdIndex((path) => Editor.create(DOC).read(path));

describe('buildIdIndex', () => {
  it('finds every holder kind, with its path, kind and label', () => {
    const byId = new Map(index().holders.flatMap((h) => (h.id === undefined ? [] : [[h.id, h]])));
    expect([...byId.keys()].sort()).toEqual(
      [
        'box',
        'brk',
        'card',
        'head',
        'lines',
        'note_cell',
        'note_text',
        'pn',
        'qty',
        'stub',
        'ticket',
        'total',
      ].sort(),
    );
    expect(byId.get('head')).toEqual({
      path: 'sections.header.items[0]',
      id: 'head',
      kind: 'text',
      label: 'Title',
    });
    expect(byId.get('total')?.path).toBe('sections.body.items[0].items[0]');
    expect(byId.get('total')?.label).toBe('order.total');
    expect(byId.get('qty')).toMatchObject({
      path: 'sections.body.items[1].columns[0]',
      kind: 'column',
      label: 'Qty',
    });
    expect(byId.get('note_cell')).toMatchObject({
      path: 'sections.body.items[1].columns[1].cell',
      kind: 'cell_frame',
      label: null,
    });
    expect(byId.get('note_text')?.path).toBe('sections.body.items[1].columns[1].cell.items[0]');
    expect(byId.get('ticket')).toMatchObject({
      path: 'sections.body.items[2].cell',
      kind: 'cell_frame',
    });
    expect(byId.get('stub')?.path).toBe('sections.body.items[2].cell.items[0]');
    expect(byId.get('card')).toMatchObject({
      path: 'sections.body.items[3].item',
      kind: 'card_frame',
    });
    expect(byId.get('pn')?.path).toBe('sections.footer.items[0]');
  });

  it('lists nodes without an id as holders too (the field can name them)', () => {
    const unnamed = index().holders.filter((h) => h.id === undefined);
    expect(unnamed.map((h) => h.kind)).toEqual([
      'ellipse',
      'column',
      'repeat',
      'repeat_flow',
      'line',
    ]);
  });

  it('finds each reference spelling at its leaf', () => {
    expect(index().refs).toEqual([
      { path: 'sections.body.items[0].items[1]', keys: ['anchor'], id: 'total' },
      { path: 'sections.body.items[4]', keys: ['from', 'item'], id: 'head' },
      { path: 'sections.body.items[4]', keys: ['to', 'item'], id: 'total' },
    ]);
    expect(refsTo(index(), 'total')).toHaveLength(2);
    expect(holdersOf(index(), 'total')).toHaveLength(1);
    expect(index().truncated).toBe(false);
  });

  it('ignores a coordinate endpoint, a non-string reference and a non-string id', () => {
    const doc = Editor.create(`
sections:
  body:
    items:
      - { type: line, from: { x: 0, y: 0 }, to: { item: 3 } }
      - { type: ellipse, anchor: [a] }
      - { type: text, id: 7 }
`);
    const built = buildIdIndex((p) => doc.read(p));
    expect(built.refs).toEqual([]);
    expect(built.holders.map((h) => h.id)).toEqual([undefined, undefined, undefined]);
  });

  it('keeps a typeless entry as an `item` holder, and reads a line with one endpoint', () => {
    const doc = Editor.create(`
sections:
  body:
    items:
      - { id: loose }
      - { type: '', id: blank }
      - { type: line, from: { item: loose } }
`);
    const built = buildIdIndex((p) => doc.read(p));
    expect(built.holders.map((h) => [h.id, h.kind])).toEqual([
      ['loose', 'item'],
      ['blank', 'item'],
      [undefined, 'line'],
    ]);
    expect(built.refs).toEqual([
      { path: 'sections.body.items[2]', keys: ['from', 'item'], id: 'loose' },
    ]);
  });

  it('treats prototype-named ids as ordinary names', () => {
    const doc = Editor.create(`
sections:
  body:
    items:
      - { type: text, id: __proto__ }
      - { type: text, id: constructor }
      - { type: ellipse, anchor: __proto__ }
`);
    const built = buildIdIndex((p) => doc.read(p));
    expect(holdersOf(built, '__proto__')).toHaveLength(1);
    expect(holdersOf(built, 'constructor')).toHaveLength(1);
    expect(refsTo(built, '__proto__')).toHaveLength(1);
  });

  it('reads an empty document, a missing section and a non-map entry as nothing', () => {
    const doc = Editor.create(`
sections:
  body:
    items:
      - just a string
      - [1, 2]
`);
    expect(buildIdIndex((p) => doc.read(p))).toEqual({
      holders: [],
      refs: [],
      nodes: 0,
      truncated: false,
    });
    expect(buildIdIndex(() => undefined).holders).toEqual([]);
  });

  it('skips a non-map column, and stops at the budget on a column too', () => {
    const doc = Editor.create(`
sections:
  body:
    items:
      - { type: table, columns: [oops, { id: kept }] }
`);
    expect(
      holdersOf(
        buildIdIndex((p) => doc.read(p)),
        'kept',
      ),
    ).toHaveLength(1);
    const columns = Array.from({ length: MAX_ID_WALK_NODES }, (_, n) => ({ id: `c${n}` }));
    const built = buildIdIndex((path) =>
      path === 'sections' ? { body: { items: [{ type: 'table', columns }] } } : undefined,
    );
    expect(built.truncated).toBe(true);
  });

  it('reads an unreadable document as truncated, never as empty', () => {
    const built = buildIdIndex(() => {
      throw new Error('alias cap');
    });
    expect(built).toEqual({ holders: [], refs: [], truncated: true });
  });

  it('marks the walk truncated past the depth cap', () => {
    let nested: unknown = { type: 'text', id: 'deep' };
    for (let n = 0; n <= MAX_TREE_DEPTH + 1; n++) {
      nested = { type: 'container', items: [nested] };
    }
    const built = buildIdIndex((path) =>
      path === 'sections' ? { body: { items: [nested] } } : undefined,
    );
    expect(built.truncated).toBe(true);
    expect(holdersOf(built, 'deep')).toHaveLength(0);
  });

  it('marks the walk truncated past the node budget', () => {
    const items = Array.from({ length: MAX_ID_WALK_NODES + 1 }, (_, n) => ({
      type: 'text',
      id: `t${n}`,
    }));
    const built = buildIdIndex((path) => (path === 'sections' ? { body: { items } } : undefined));
    expect(built.truncated).toBe(true);
    expect(built.holders).toHaveLength(MAX_ID_WALK_NODES);
  });
});

describe('subtreeIndex', () => {
  it('roots an item subtree at the given path', () => {
    const sub = subtreeIndex(
      { type: 'container', id: 'g', items: [{ type: 'ellipse', anchor: 'g' }] },
      'sections.body.items[5]',
    );
    expect(sub.holders.map((h) => h.path)).toEqual([
      'sections.body.items[5]',
      'sections.body.items[5].items[0]',
    ]);
    expect(sub.refs).toEqual([
      { path: 'sections.body.items[5].items[0]', keys: ['anchor'], id: 'g' },
    ]);
  });

  it('walks a path ending in a column index as a column', () => {
    const sub = subtreeIndex(
      { id: 'c', cell: { items: [{ type: 'text', id: 'in' }] } },
      'sections.body.items[0].columns[2]',
    );
    expect(sub.holders.map((h) => [h.kind, h.id])).toEqual([
      ['column', 'c'],
      ['cell_frame', undefined],
      ['text', 'in'],
    ]);
  });
});
