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
    // A `%` `y` is NOT in this list: it is refused, in the `%` height suite
    // below ('refuses a line whose endpoint y is a percentage'). What is left
    // here are the endpoints a container's `y` genuinely cannot be derived
    // from — a `Length` string with no number to take, an anchor resolved after
    // layout, and a missing endpoint.
    const millimetres = '{ type: line, from: { x: 0, y: 90mm }, to: { x: 100, y: 700 } }';
    const anchored = '{ type: line, from: { item: a }, to: { x: 100, y: 700 } }';
    const endless = '{ type: line, to: { x: 100, y: 700 } }';
    for (const line of [millimetres, anchored, endless]) {
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

describe('wrapInContainerOps — a percentage height keeps its basis', () => {
  // A new container is always auto-height, so a `%` height left on the item has
  // nothing to resolve against: the engine drops it with `percent_of_auto` and
  // a `rect` is not drawn at all. The container takes the height and the item
  // takes the container. Measured against the real engine in
  // `integration/wasm.test.ts` ('wraps an item in a container without moving it
  // on the page, in every owner').

  it('moves a percentage h onto the container and fills it with the item', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { x: 10, y: 700, w: 50, h: "10%" } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 10, y: 700, h: '10%' },
      items: [{ type: 'rect', box: { w: 50, h: '100%' } }],
    });
  });

  it('moves the height bounds with it, so the clamp still has its basis', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { y: 700, w: 50, h: 20, minHeight: "10%" } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, h: 20, minHeight: '10%' },
      items: [{ type: 'rect', box: { w: 50, h: '100%' } }],
    });
    expect(
      wrapped(
        footer('{ type: rect, box: { y: 700, w: 50, h: 300, maxHeight: "10%" } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, h: 300, maxHeight: '10%' },
      items: [{ type: 'rect', box: { w: 50, h: '100%' } }],
    });
  });

  it('moves the margin too, so the item does not overflow its own container', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { y: 700, w: 50, h: "10%", margin: { top: 8, bottom: 4 } } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, h: '10%', margin: { top: 8, bottom: 4 } },
      items: [{ type: 'rect', box: { w: 50, h: '100%' } }],
    });
  });

  it('leaves padding on the item, which insets content inside the same border box', () => {
    expect(
      wrapped(
        footer('{ type: text, text: hi, box: { y: 700, h: "10%", padding: 4 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, h: '10%' },
      items: [{ type: 'text', text: 'hi', box: { h: '100%', padding: 4 } }],
    });
  });

  it('reads a percentage the way the engine does — trimmed, suffixed `%`', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { y: 700, w: 50, h: " 10% " } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, h: ' 10% ' },
      items: [{ type: 'rect', box: { w: 50, h: '100%' } }],
    });
  });

  it('leaves the height alone when no vertical size key is a percentage', () => {
    // The negative control for the height axis: a pt height and a `Length` that
    // is not a `%` stay on the item. (The `%` WIDTH beside it travels — that is
    // the width axis, below — so the height's own control uses neither.)
    expect(
      wrapped(
        footer('{ type: rect, box: { x: 10, y: 700, w: 120, h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 10, y: 700 },
      items: [{ type: 'rect', box: { w: 120, h: 20 } }],
    });
    expect(
      wrapped(footer('{ type: rect, box: { y: 700, w: 50, h: 5mm } }'), 'sections.footer.items[0]'),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700 },
      items: [{ type: 'rect', box: { w: 50, h: '5mm' } }],
    });
  });

  it("leaves an anchored ellipse's percentage height on it, where nothing reads it", () => {
    expect(
      wrapped(
        footer('{ type: ellipse, anchor: a, box: { h: "10%", w: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column' },
      items: [{ type: 'ellipse', anchor: 'a', box: { h: '10%', w: 20 } }],
    });
  });
});

describe('wrapInContainerOps — a percentage width keeps its basis', () => {
  // A container with no `w` is "the parent width minus the x offset", so a `%`
  // width left on an OFFSET item resolves against a narrower box: measured
  // against the real engine, a 50% rect at x: 100 in a 545.28pt band came out
  // 222.64pt instead of 272.64. The container takes the width and the item
  // takes the container. Unlike the height there is nothing to refuse — a
  // container's width is definite in every owner.

  it('moves a percentage w onto the container and fills it with the item', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { x: 100, y: 700, w: "50%", h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 100, y: 700, w: '50%' },
      items: [{ type: 'rect', box: { h: 20, w: '100%' } }],
    });
  });

  it('moves the width bounds with it, so the clamp still has its basis', () => {
    // All three width keys travel together: a `%` bound beside a pt `w` clamps
    // the same box only if the box it clamps is the one that moved.
    expect(
      wrapped(
        footer('{ type: rect, box: { x: 100, y: 700, w: 60, minWidth: "50%", h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 100, y: 700, w: 60, minWidth: '50%' },
      items: [{ type: 'rect', box: { h: 20, w: '100%' } }],
    });
    expect(
      wrapped(
        footer('{ type: rect, box: { y: 700, w: 300, maxWidth: "50%", h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, w: 300, maxWidth: '50%' },
      items: [{ type: 'rect', box: { h: 20, w: '100%' } }],
    });
  });

  it('leaves an unsized width unsized, so the container is not measured as the owner', () => {
    // A `%` BOUND with no `w`: the item's width is whatever its owner measures.
    // Writing `w: "100%"` onto it would make an owner that sizes a child from
    // its content — a flex row, an `auto` grid track — measure the wrapper as
    // the whole basis (272.64pt → 515.99 in a row, against the real engine).
    expect(
      wrapped(
        footer('{ type: text, text: hi, box: { x: 100, y: 700, minWidth: "50%" } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 100, y: 700, minWidth: '50%' },
      items: [{ type: 'text', text: 'hi' }],
    });
  });

  it('takes the margin with it, since the spacing is measured against that width', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { y: 700, w: "50%", h: 20, margin: { left: "5%" } } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700, w: '50%', margin: { left: '5%' } },
      items: [{ type: 'rect', box: { h: 20, w: '100%' } }],
    });
  });

  it('carries both axes at once, each with its own fill', () => {
    expect(
      wrapped(
        footer('{ type: rect, box: { x: 10, y: 700, w: "50%", h: "10%" } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 10, y: 700, w: '50%', h: '10%' },
      items: [{ type: 'rect', box: { h: '100%', w: '100%' } }],
    });
  });

  it('leaves the width alone when no horizontal size key is a percentage', () => {
    // The negative control: pt widths and a `Length` that is not a `%` stay.
    expect(
      wrapped(
        footer('{ type: rect, box: { x: 10, y: 700, w: 120, minWidth: 40, h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', x: 10, y: 700 },
      items: [{ type: 'rect', box: { w: 120, minWidth: 40, h: 20 } }],
    });
    expect(
      wrapped(footer('{ type: rect, box: { y: 700, w: 5mm, h: 20 } }'), 'sections.footer.items[0]'),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700 },
      items: [{ type: 'rect', box: { w: '5mm', h: 20 } }],
    });
  });

  it("leaves an anchored ellipse's percentage width on it, and a line has no box", () => {
    expect(
      wrapped(
        footer('{ type: ellipse, anchor: a, box: { w: "50%", h: 20 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column' },
      items: [{ type: 'ellipse', anchor: 'a', box: { w: '50%', h: 20 } }],
    });
    expect(
      wrapped(
        footer('{ type: line, from: { x: 0, y: 700 }, to: { x: "100%", y: 700 } }'),
        'sections.footer.items[0]',
      ),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', y: 700 },
      items: [{ type: 'line', from: { x: 0, y: 0 }, to: { x: '100%', y: 0 } }],
    });
  });
});

describe('isWrappable — the percentage heights that cannot be carried', () => {
  // These have no re-authoring that preserves them, so the wrap is not offered
  // at all — the same silent treatment `page_number` and `repeat` already get.

  it('refuses a percentage height bound with no height to move it onto', () => {
    for (const bound of ['minHeight', 'maxHeight']) {
      const node = { type: 'rect', box: { w: 50, [bound]: '10%' } };
      expect(isWrappable('sections.footer.items[0]', node), bound).toBe(false);
      expect(
        wrapInContainerOps(() => node, 'sections.footer.items[0]'),
        bound,
      ).toBeNull();
    }
  });

  it('refuses a bound whose h is authored with no value at all', () => {
    // `h:` with nothing after it reads as `null`, which is not `undefined` — and
    // a `null` height carries a `%` bound no better than a missing one.
    const source = [
      'sections:',
      '  footer:',
      '    repeat: every_page',
      '    items:',
      '      - type: rect',
      '        box:',
      '          h:',
      '          minHeight: "10%"',
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const path = 'sections.footer.items[0]';
    expect(isWrappable(path, editor.read(path))).toBe(false);
    expect(wrapInContainerOps((p) => editor.read(p), path)).toBeNull();
  });

  it('accepts the same bound once an h is authored to carry it', () => {
    for (const bound of ['minHeight', 'maxHeight']) {
      const node = { type: 'rect', box: { w: 50, h: 20, [bound]: '10%' } };
      expect(isWrappable('sections.footer.items[0]', node), bound).toBe(true);
    }
  });

  it('refuses them in every owner, the one that could preserve them included', () => {
    // Measured against the real engine, owner by owner. Everywhere but a flex
    // ROW the shape is lost: a `%` bound with no `h` collapses to its content
    // with `percent_of_auto` (flow/absolute body, header/footer band, column or
    // grid container, repeat cell, card, table cell — 158.4pt became 14), and a
    // `%` endpoint `y` lands at the container's top. A flex ROW is the
    // exception: the wrapper inherits the row's cross-axis stretch, so a line
    // and a `100%` bound come out identical with no diagnostic, while any other
    // bound loses the item's own stretch silently (200 -> 40). It is refused
    // there too rather than offering a command that preserves the shape at one
    // value of the percentage — which is why this case needs no owner, not
    // because the check cannot see one. `integration/wasm.test.ts` renders the
    // row exception itself; this case pins the refusal over the owner set.
    const owners = [
      'sections.body.items[0]',
      'sections.footer.items[0]',
      'sections.body.items[2].items[1]',
      'sections.body.items[2].cell.items[0]',
      'sections.body.items[2].item.items[0]',
      'sections.body.items[2].columns[1].cell.items[0]',
    ];
    const shapes: [string, unknown][] = [
      ['bound', { type: 'text', text: 'hi', box: { minHeight: '20%' } }],
      ['line', { type: 'line', from: { x: 0, y: '10%' }, to: { x: 100, y: '10%' } }],
    ];
    for (const path of owners) {
      for (const [name, node] of shapes) {
        expect(isWrappable(path, node), `${name} at ${path}`).toBe(false);
        expect(
          wrapInContainerOps(() => node, path),
          `${name} ops at ${path}`,
        ).toBeNull();
      }
    }
  });

  it('refuses a line whose endpoint y is a percentage', () => {
    const ends = [
      { from: { x: 0, y: '90%' }, to: { x: 100, y: 700 } },
      { from: { x: 0, y: 700 }, to: { x: 100, y: '90%' } },
    ];
    for (const [n, end] of ends.entries()) {
      const node = { type: 'line', ...end };
      expect(isWrappable('sections.footer.items[0]', node), `end ${n}`).toBe(false);
      expect(
        wrapInContainerOps(() => node, 'sections.footer.items[0]'),
        `end ${n}`,
      ).toBeNull();
    }
  });

  it('survives shapes the wire would refuse anyway, without throwing', () => {
    const cases: [string, unknown][] = [
      ['h is not a length', { type: 'rect', box: { h: { nested: true } } }],
      ['h is a number', { type: 'rect', box: { h: 20 } }],
      ['box is not a map', { type: 'rect', box: 'broken' }],
      ['line endpoints are not maps', { type: 'line', from: 'a', to: 7 }],
      ['line has no endpoints', { type: 'line' }],
      ['an absurd percentage', { type: 'rect', box: { h: '1e309%' } }],
    ];
    for (const [name, node] of cases) {
      expect(() => isWrappable('sections.footer.items[0]', node), name).not.toThrow();
    }
    // The absurd magnitude still wraps. `"1e309"` parses to infinity, which
    // `finite()` refuses at PARSE (`engine/core/src/length.rs` names this exact
    // string), so the document never renders — the wrap only has to move it
    // verbatim. Not `MAX_RESOLVED_PT`, which is a layout-time clamp and only
    // ever sees values that already parsed finite.
    expect(
      wrapped(footer('{ type: rect, box: { h: "1e309%" } }'), 'sections.footer.items[0]'),
    ).toEqual({
      type: 'container',
      box: { direction: 'column', h: '1e309%' },
      items: [{ type: 'rect', box: { h: '100%' } }],
    });
  });
});
