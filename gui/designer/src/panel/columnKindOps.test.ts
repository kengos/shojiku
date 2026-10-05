// The kind-switch edits for a table column: the exact batch for each direction,
// what a switch into and out of a `cell:` carries, what the confirm summarizes,
// and the hostile-document bounds.

import { Editor, type Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { carryBinding, cellSummary, kindSwitchOps } from './columnKindOps';
import { readColumnsView } from './columnsModel';

const TABLE = 'sections.body.items[0]';
const col = (n: number) => `${TABLE}.columns[${n}]`;

const DOC = `sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
        columns:
          # the name column
          - label: Name
            data: { key: name, format: upper, placeholder: "-", scope: document }
            width: 40
          - label: Code
            type: qr_code
            data: { key: url, placeholder: none }
          - label: Photo
            type: image
            fit: cover
            data: { key: photo, format: upper }
          - label: Detail
            cell:
              items:
                - type: rect
                - type: container
                  items:
                    - type: image
                      fit: none
                      data: { key: photo }
                - type: text
                  data: { key: name }
          - label: Blank
          - label: Empty
            cell: { items: [] }
          - label: Draft
            type: text
            data: { key: name }
`;

function session(text = DOC): Editor {
  return Editor.create(text);
}

function apply(editor: Editor, ops: readonly Op[]) {
  expect(editor.applyAll(ops).ok).toBe(true);
}

const read = (editor: Editor) => (path: string) => editor.read(path);

/** The frame a carried cell gets in this fixture: the engine's 4pt padding and
 * the table default `middle` (no table layer sets either). */
const FRAME = { padding: 4, justifyContent: 'center' };

describe('kindSwitchOps between the bound kinds', () => {
  it('text → qr_code / image sets only `type`', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(0), 'qr_code')).toEqual([
      { op: 'setScalar', path: col(0), keys: ['type'], value: 'qr_code' },
    ]);
    expect(kindSwitchOps(read(editor), col(0), 'image')).toEqual([
      { op: 'setScalar', path: col(0), keys: ['type'], value: 'image' },
    ]);
  });

  it('qr_code → text removes `type`; qr_code → image sets it', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(1), 'text')).toEqual([
      { op: 'removeKey', path: col(1), keys: ['type'] },
    ]);
    expect(kindSwitchOps(read(editor), col(1), 'image')).toEqual([
      { op: 'setScalar', path: col(1), keys: ['type'], value: 'image' },
    ]);
  });

  it('image → anything else also removes `fit`, and keeps format and placeholder', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(2), 'text')).toEqual([
      { op: 'removeKey', path: col(2), keys: ['type'] },
      { op: 'removeKey', path: col(2), keys: ['fit'] },
    ]);
    expect(kindSwitchOps(read(editor), col(2), 'qr_code')).toEqual([
      { op: 'setScalar', path: col(2), keys: ['type'], value: 'qr_code' },
      { op: 'removeKey', path: col(2), keys: ['fit'] },
    ]);
  });

  it('an image column with no `fit` emits no removal for it', () => {
    const editor = session(DOC.replace('            fit: cover\n', ''));
    expect(kindSwitchOps(read(editor), col(2), 'text')).toEqual([
      { op: 'removeKey', path: col(2), keys: ['type'] },
    ]);
  });

  it('removes an explicit `type: text` only when there is one', () => {
    const editor = session();
    // Draft spells the default out; Name relies on it.
    expect(kindSwitchOps(read(editor), col(6), 'cell')[0]).toEqual({
      op: 'removeKey',
      path: col(6),
      keys: ['data'],
    });
    expect(kindSwitchOps(read(editor), col(6), 'cell')).toContainEqual({
      op: 'removeKey',
      path: col(6),
      keys: ['type'],
    });
  });

  it('re-picking the current kind, or a hostile column, changes nothing', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(0), 'text')).toEqual([]);
    expect(kindSwitchOps(read(editor), col(3), 'cell')).toEqual([]);
    expect(kindSwitchOps(() => 3, col(0), 'image')).toEqual([]);
    expect(kindSwitchOps(() => undefined, col(0), 'image')).toEqual([]);
  });

  it('a trip text → image → text leaves the file byte-identical', () => {
    const editor = session();
    const before = editor.text();
    apply(editor, kindSwitchOps(read(editor), col(0), 'image'));
    expect(editor.text()).toContain('type: image');
    // Format, placeholder and scope survive on the image column.
    expect(editor.read(`${col(0)}.data`)).toEqual({
      key: 'name',
      format: 'upper',
      placeholder: '-',
      scope: 'document',
    });
    apply(editor, kindSwitchOps(read(editor), col(0), 'text'));
    expect(editor.text()).toBe(before);
  });
});

describe('kindSwitchOps into a cell', () => {
  it('moves a text column’s whole binding into one text item', () => {
    const editor = session();
    apply(editor, kindSwitchOps(read(editor), col(0), 'cell'));
    expect(editor.read(col(0))).toEqual({
      label: 'Name',
      width: 40,
      cell: {
        box: FRAME,
        items: [
          {
            type: 'text',
            data: { key: 'name', format: 'upper', placeholder: '-', scope: 'document' },
          },
        ],
      },
    });
    // The sibling column and the comment above the first column are untouched.
    expect(editor.text()).toContain('# the name column');
    expect(editor.read(col(1))).toEqual({
      label: 'Code',
      type: 'qr_code',
      data: { key: 'url', placeholder: 'none' },
    });
  });

  it('gives a carried QR code a cell-filling box', () => {
    const editor = session();
    apply(editor, kindSwitchOps(read(editor), col(1), 'cell'));
    expect(editor.read(col(1))).toEqual({
      label: 'Code',
      cell: {
        box: FRAME,
        items: [
          {
            type: 'qr_code',
            data: { key: 'url', placeholder: 'none' },
            box: { w: '100%', h: '100%' },
          },
        ],
      },
    });
  });

  it('gives a carried image the box and the column’s fit', () => {
    const editor = session();
    apply(editor, kindSwitchOps(read(editor), col(2), 'cell'));
    expect(editor.read(`${col(2)}.cell.items[0]`)).toEqual({
      type: 'image',
      data: { key: 'photo', format: 'upper' },
      box: { w: '100%', h: '100%' },
      fit: 'cover',
    });
    expect(editor.read(`${col(2)}.type`)).toBeUndefined();
    expect(editor.read(`${col(2)}.fit`)).toBeUndefined();
  });

  it('an image column with no fit carries none', () => {
    const editor = session(DOC.replace('            fit: cover\n', ''));
    apply(editor, kindSwitchOps(read(editor), col(2), 'cell'));
    expect(editor.read(`${col(2)}.cell.items[0]`)).toEqual({
      type: 'image',
      data: { key: 'photo', format: 'upper' },
      box: { w: '100%', h: '100%' },
    });
  });

  it('a column with no data key becomes an empty cell', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(4), 'cell')).toEqual([
      { op: 'putValue', path: col(4), keys: ['cell'], value: { box: FRAME, items: [] } },
    ]);
    apply(editor, kindSwitchOps(read(editor), col(4), 'cell'));
    expect(readColumnsView(editor.read(TABLE))?.[4].kind).toBe('cell');
  });
});

describe('kindSwitchOps out of a cell', () => {
  it('takes the first bound item depth-first, with its fit for an image column', () => {
    const editor = session();
    apply(editor, kindSwitchOps(read(editor), col(3), 'image'));
    expect(editor.read(col(3))).toEqual({
      label: 'Detail',
      data: { key: 'photo' },
      type: 'image',
      fit: 'none',
    });
  });

  it('to text writes the binding alone; to a QR code adds `type` but no fit', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(3), 'text')).toEqual([
      { op: 'removeKey', path: col(3), keys: ['cell'] },
      { op: 'putValue', path: col(3), keys: ['data'], value: { key: 'photo' } },
    ]);
    expect(kindSwitchOps(read(editor), col(3), 'qr_code')).toEqual([
      { op: 'removeKey', path: col(3), keys: ['cell'] },
      { op: 'putValue', path: col(3), keys: ['data'], value: { key: 'photo' } },
      { op: 'setScalar', path: col(3), keys: ['type'], value: 'qr_code' },
    ]);
  });

  it('an empty cell leaves the column with no binding (the engine then asks for one)', () => {
    const editor = session();
    expect(kindSwitchOps(read(editor), col(5), 'image')).toEqual([
      { op: 'removeKey', path: col(5), keys: ['cell'] },
      { op: 'setScalar', path: col(5), keys: ['type'], value: 'image' },
    ]);
  });

  it('clears a stray type / fit the conflicting column carried', () => {
    const reads = (path: string) =>
      path === 'c' ? { type: 'image', fit: 'cover', cell: { items: [] } } : undefined;
    expect(kindSwitchOps(reads, 'c', 'text')).toEqual([
      { op: 'removeKey', path: 'c', keys: ['cell'] },
      { op: 'removeKey', path: 'c', keys: ['type'] },
      { op: 'removeKey', path: 'c', keys: ['fit'] },
    ]);
  });
});

describe('carryBinding', () => {
  it('keeps the four wire keys with string values, nothing else', () => {
    expect(
      carryBinding({ key: 'a', format: 'f', placeholder: 'p', scope: 'document', extra: 'x' }),
    ).toEqual({ key: 'a', format: 'f', placeholder: 'p', scope: 'document' });
    expect(carryBinding({ key: 'a', format: 3, placeholder: { x: 1 } })).toEqual({ key: 'a' });
  });

  it('is null without a non-empty string key', () => {
    expect(carryBinding({ key: '' })).toBeNull();
    expect(carryBinding({ key: 5 })).toBeNull();
    expect(carryBinding('key')).toBeNull();
    expect(carryBinding(undefined)).toBeNull();
  });

  it('keeps a `__proto__` entry inert and never reads inherited keys', () => {
    const hostile = JSON.parse('{"key":"a","__proto__":{"format":"evil","polluted":"yes"}}');
    const binding = carryBinding(hostile);
    expect(binding).toEqual({ key: 'a' });
    expect(Object.getPrototypeOf(binding)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // A key the object only INHERITS is not the binding's own.
    expect(carryBinding(Object.create({ key: 'a' }))).toBeNull();
    expect(carryBinding(Object.assign(Object.create({ format: 'f' }), { key: 'a' }))).toEqual({
      key: 'a',
    });
  });
});

describe('cellSummary', () => {
  it('counts the top-level items, lists their types and finds the first binding', () => {
    const editor = session();
    expect(cellSummary(editor.read(`${col(3)}.cell`))).toEqual({
      count: 3,
      types: ['rect', 'container', 'text'],
      binding: { key: 'photo' },
      bindingType: 'image',
      bindingFit: 'none',
    });
  });

  it('reads a hostile cell as empty and skips non-map and untyped items', () => {
    expect(cellSummary(undefined)).toEqual({
      count: 0,
      types: [],
      binding: null,
      bindingType: '',
      bindingFit: '',
    });
    expect(cellSummary({ items: 'x' }).count).toBe(0);
    expect(cellSummary({ items: [3, { type: 9 }, { type: 'text', data: { key: 'n' } }] })).toEqual({
      count: 3,
      types: ['', '', 'text'],
      binding: { key: 'n' },
      bindingType: 'text',
      bindingFit: '',
    });
  });

  it('stops walking past the depth bound', () => {
    let deep: unknown = { type: 'text', data: { key: 'deep' } };
    for (let i = 0; i < 40; i++) {
      deep = { type: 'container', items: [deep] };
    }
    expect(cellSummary({ items: [deep] }).binding).toBeNull();
  });

  it('stops walking past the node budget, however wide the tree', () => {
    const wide = Array.from({ length: 600 }, () => ({ type: 'rect' }));
    expect(
      cellSummary({ items: [...wide, { type: 'text', data: { key: 'late' } }] }).binding,
    ).toBeNull();
    expect(
      cellSummary({ items: [...wide.slice(0, 10), { type: 'text', data: { key: 'early' } }] })
        .binding,
    ).toEqual({ key: 'early' });
  });
});
