import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { isWrappable, wrapInContainerOps } from './wrap';

const SOURCE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: hello',
  '      - type: container',
  '        box: { direction: column }',
  '        items:',
  '          - type: text',
  '            text: inner',
  '      - type: table',
  '        data: { key: rows }',
  '        columns:',
  '          - id: name',
  '            label: 品目',
  '            data: { key: name }',
  '',
].join('\n');

describe('isWrappable', () => {
  const TEXT = { type: 'text', text: 'x' };

  it('accepts an items-list entry (flow body, container child, band)', () => {
    expect(isWrappable('sections.body.items[0]', TEXT)).toBe(true);
    expect(isWrappable('sections.body.items[1].items[0]', TEXT)).toBe(true);
    expect(isWrappable('sections.footer.items[0]', TEXT)).toBe(true);
  });

  it('rejects a section root and a table column (not an items list)', () => {
    expect(isWrappable('sections.body', TEXT)).toBe(false);
    expect(isWrappable('sections.body.items[2].columns[0]', TEXT)).toBe(false);
    expect(isWrappable('sections.body.items[2].headerGroups[0]', TEXT)).toBe(false);
  });

  it('rejects every kind a container warns and skips, which the wrap would erase', () => {
    for (const type of ['page_number', 'page_break', 'repeat', 'repeat_flow']) {
      expect(isWrappable('sections.footer.items[0]', { type }), type).toBe(false);
    }
  });

  it('rejects an entry that is not a map', () => {
    expect(isWrappable('sections.body.items[0]', undefined)).toBe(false);
    expect(isWrappable('sections.body.items[0]', 'broken')).toBe(false);
    expect(isWrappable('sections.body.items[0]', [TEXT])).toBe(false);
  });
});

describe('wrapInContainerOps', () => {
  it('wraps a leaf item in a column container in place (one batch, node preserved)', () => {
    const editor = Editor.create(SOURCE);
    const ops = wrapInContainerOps((p) => editor.read(p), 'sections.body.items[0]');
    expect(ops).not.toBeNull();
    expect(editor.applyAll(ops as NonNullable<typeof ops>).ok).toBe(true);
    // The container now occupies the old index, holding the original node.
    expect(editor.read('sections.body.items[0]')).toEqual({
      type: 'container',
      box: { direction: 'column' },
      items: [{ type: 'text', text: 'hello' }],
    });
    // The other body items are untouched (shifted by nothing — wrap is in place).
    expect((editor.read('sections.body.items[1]') as { type: string }).type).toBe('container');
  });

  it('wraps a container itself (nesting)', () => {
    const editor = Editor.create(SOURCE);
    const ops = wrapInContainerOps((p) => editor.read(p), 'sections.body.items[1]');
    expect(editor.applyAll(ops as NonNullable<typeof ops>).ok).toBe(true);
    const wrapped = editor.read('sections.body.items[1]') as { type: string; items: unknown[] };
    expect(wrapped.type).toBe('container');
    expect((wrapped.items[0] as { type: string; items: unknown[] }).type).toBe('container');
    expect((wrapped.items[0] as { items: { text: string }[] }).items[0].text).toBe('inner');
  });

  it('returns null for a non-items sequence (a table column)', () => {
    const editor = Editor.create(SOURCE);
    expect(
      wrapInContainerOps((p) => editor.read(p), 'sections.body.items[2].columns[0]'),
    ).toBeNull();
  });

  it('returns null for a section root (not a sequence entry)', () => {
    const editor = Editor.create(SOURCE);
    expect(wrapInContainerOps((p) => editor.read(p), 'sections.body')).toBeNull();
  });

  it('returns null when the read throws (a hostile subtree)', () => {
    const throwing = () => {
      throw new Error('alias bomb');
    };
    expect(wrapInContainerOps(throwing, 'sections.body.items[0]')).toBeNull();
  });

  it('an OVERSIZED subtree builds ops the op layer rejects — the batch rolls back whole', () => {
    // wrapInContainerOps itself does not size-check: the re-authored node
    // rides insertItem's snippet validator (node cap 256), so a giant subtree
    // must fail the batch atomically, leaving the document byte-identical.
    const children = Array.from(
      { length: 300 },
      () => '          - type: text\n            text: x',
    );
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        items:',
      ...children,
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const before = editor.text();
    const ops = wrapInContainerOps((p) => editor.read(p), 'sections.body.items[0]');
    expect(ops).not.toBeNull();
    expect(editor.applyAll(ops as NonNullable<typeof ops>).ok).toBe(false);
    expect(editor.text()).toBe(before);
  });

  it('returns null when the node is not a map', () => {
    const notMap = () => 42;
    expect(wrapInContainerOps(notMap, 'sections.body.items[0]')).toBeNull();
  });

  it('returns null for a kind the container would skip (a footer page number)', () => {
    const editor = Editor.create(footer('{ type: page_number }'));
    expect(wrapInContainerOps((p) => editor.read(p), 'sections.footer.items[0]')).toBeNull();
  });
});

/** A document whose footer holds exactly `item`. */
function footer(item: string): string {
  return [
    'sections:',
    '  body:',
    '    type: flow',
    '    items: []',
    '  footer:',
    '    repeat: every_page',
    '    items:',
    `      - ${item}`,
    '',
  ].join('\n');
}

/** Wrap `path` in `source` and return the container that replaced it. */
function wrapped(source: string, path: string): unknown {
  const editor = Editor.create(source);
  const ops = wrapInContainerOps((p) => editor.read(p), path);
  if (ops === null) throw new Error('wrap refused');
  expect(editor.applyAll(ops).ok).toBe(true);
  return editor.read(path);
}

describe('wrapInContainerOps — the item keeps its place on the page', () => {
  it("moves a band item's x/y onto the container and keeps its other box keys", () => {
    expect(
      wrapped(
        footer('{ type: text, text: hi, box: { x: 10, y: 700, w: 100 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 10, y: 700 },
      items: [{ type: 'text', text: 'hi', box: { w: 100 } }],
    });
  });

  it('moves only the coordinate that is authored', () => {
    expect(
      wrapped(
        footer('{ type: text, text: hi, box: { y: 700, h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700 },
      items: [{ type: 'text', text: 'hi', box: { h: 20 } }],
    });
  });

  it('drops a child box that held nothing but its position', () => {
    expect(
      wrapped(footer('{ type: text, text: hi, box: { x: 0, y: 0 } }'), 'sections.footer.items[0]'),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 0, y: 0 },
      items: [{ type: 'text', text: 'hi' }],
    });
  });

  it('keeps an emptied box on a rect, whose box the wire requires', () => {
    expect(
      wrapped(footer('{ type: rect, box: { x: 10, y: 700 } }'), 'sections.footer.items[0]'),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 10, y: 700 },
      items: [{ type: 'rect', box: {} }],
    });
  });

  it('moves the keys that give the item its share of a row or grid', () => {
    const body = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        box: { type: grid, columns: 2 }',
      '        items:',
      '          - { type: text, text: hi, box: { flexGrow: 1, flexBasis: 0, columnSpan: 2, rowSpan: 1, w: 50 } }',
      '',
    ].join('\n');
    expect(wrapped(body, 'sections.body.items[0].items[0]')).toEqual({
      type: 'container',
      box: { direction: 'column', flexGrow: 1, flexBasis: 0, columnSpan: 2, rowSpan: 1 },
      items: [{ type: 'text', text: 'hi', box: { w: 50 } }],
    });
  });

  it('moves Length strings verbatim', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { x: "10%", y: 5mm, w: 50, h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: '10%', y: '5mm' },
      items: [{ type: 'rect', box: { w: 50, h: 20 } }],
    });
  });

  it('moves the position in the absolute body, the flow body and a container too', () => {
    const body = (type: string, items: string[]) =>
      ['sections:', '  body:', `    type: ${type}`, '    items:', ...items, ''].join('\n');
    const item = '      - { type: text, text: hi, box: { x: 40, y: 60 } }';
    const expected = {
      type: 'container',
      box: { direction: 'column', x: 40, y: 60 },
      items: [{ type: 'text', text: 'hi' }],
    };
    expect(wrapped(body('absolute', [item]), 'sections.body.items[0]')).toEqual(expected);
    expect(wrapped(body('flow', [item]), 'sections.body.items[0]')).toEqual(expected);
    const nested = ['      - type: container', '        items:', `  ${item}`];
    expect(wrapped(body('flow', nested), 'sections.body.items[0].items[0]')).toEqual(expected);
  });

  it("leaves an anchored ellipse's keys on it, where the engine never reads them", () => {
    expect(
      wrapped(
        footer('{ type: ellipse, anchor: a, box: { x: 10, y: 600 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column' },
      items: [{ type: 'ellipse', anchor: 'a', box: { x: 10, y: 600 } }],
    });
  });

  it('leaves a box that is not a map as authored', () => {
    expect(wrapped(footer('{ type: text, text: hi, box: 5 }'), 'sections.footer.items[0]')).toEqual(
      {
        type: 'container',
        box: { direction: 'column' },
        items: [{ type: 'text', text: 'hi', box: 5 }],
      },
    );
  });

  it("moves a band line's topmost numeric y onto the container", () => {
    expect(
      wrapped(
        footer('{ type: line, from: { x: 10, y: 710 }, to: { x: 200, y: 700 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700 },
      items: [{ type: 'line', from: { x: 10, y: 10 }, to: { x: 200, y: 0 } }],
    });
  });

  it('leaves a line whose y is not a number on both ends as authored', () => {
    const percent = '{ type: line, from: { x: 0, y: "90%" }, to: { x: 100, y: 700 } }';
    const anchored = '{ type: line, from: { item: a }, to: { x: 100, y: 700 } }';
    const endless = '{ type: line, to: { x: 100, y: 700 } }';
    for (const line of [percent, anchored, endless]) {
      const container = wrapped(footer(line), 'sections.footer.items[0]') as { box: unknown };
      expect(container.box, line).toEqual({ direction: 'column' });
    }
  });

  it("leaves a line in the flow body as authored, where a container's y is not read", () => {
    const flow = (type: string) =>
      [
        'sections:',
        '  body:',
        `    type: ${type}`,
        '    items:',
        '      - { type: line, from: { x: 0, y: 30 }, to: { x: 100, y: 30 } }',
        '',
      ].join('\n');
    expect((wrapped(flow('flow'), 'sections.body.items[0]') as { box: unknown }).box).toEqual({
      direction: 'column',
    });
    expect((wrapped(flow('absolute'), 'sections.body.items[0]') as { box: unknown }).box).toEqual({
      direction: 'column',
      y: 30,
    });
  });

  it('treats a body whose type cannot be read as the flow body', () => {
    const editor = Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - { type: line, from: { x: 0, y: 30 }, to: { x: 1, y: 30 } }',
        '',
      ].join('\n'),
    );
    const read = (p: string) => {
      if (p === 'sections.body.type') throw new Error('alias bomb');
      return editor.read(p);
    };
    const ops = wrapInContainerOps(read, 'sections.body.items[0]');
    const insert = ops?.[0] as unknown as { value: { box: unknown } };
    expect(insert.value.box).toEqual({ direction: 'column' });
  });
});
