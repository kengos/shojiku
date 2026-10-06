import { Editor, MAX_BATCH_OPS, type Op, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { LayoutMode } from './layoutModel';
import { basisOps, modeSwitchOps as switchWith } from './layoutModeOps';

/** A read that never leaks the prototype (own-key guard) — the shape the real
 * editor read has (a grammar lookup, not object indexing). */
function reader(map: Record<string, unknown>): ReadFn {
  return (path) => (Object.hasOwn(map, path) ? map[path] : undefined);
}

/** A read that throws — an alias-bomb subtree. */
const throwingRead: ReadFn = () => {
  throw new Error('alias bomb');
};

const PATH = 'sections.body.items[0]';

function container(box: Record<string, unknown>, items: unknown[] = []): ReadFn {
  return reader({ [PATH]: { type: 'container', box, items } });
}

const text = (box?: Record<string, unknown>) =>
  box === undefined ? { type: 'text', text: 't' } : { type: 'text', text: 't', box };

const child = (index: number) => `${PATH}.items[${index}]`;

/** The two engine shapes a switch to a grid writes for: a column-track LIST
 * (`grid.fr` + `grid.auto`) or, without them, an equal column COUNT. */
const LIST = { trackList: true };
const COUNT = { trackList: false };

/** The switch against an engine WITHOUT track lists — the count rule, which
 * most of the cases below exercise; the list rule has its own block. */
const modeSwitchOps = (read: ReadFn, path: string, target: LayoutMode) =>
  switchWith(read, path, target, COUNT);

const line = { type: 'line', from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };

/** The dotted key path a map-key op touches (`''` for an item op). */
const keysOf = (op: Op) => ('keys' in op ? op.keys.join('.') : '');

describe('modeSwitchOps — to a grid, as a column count', () => {
  it('turns a row into a one-row grid with a column per flex item, dropping direction', () => {
    const ops = modeSwitchOps(
      container({ direction: 'row', gap: 8 }, [text(), text(), text({ w: 40 })]),
      PATH,
      'grid',
    );
    expect(ops).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'type'], value: 'grid' },
      { op: 'setScalar', path: PATH, keys: ['box', 'columns'], value: 3 },
      // In a grid `direction` is the fill order — it must not survive the switch.
      { op: 'removeKey', path: PATH, keys: ['box', 'direction'] },
    ]);
  });

  it('counts only the children laid out by flex: not an x/y child, a line or a hostile entry', () => {
    const ops = modeSwitchOps(
      container({ direction: 'row' }, [
        text(),
        text({ x: 4 }),
        text({ y: 4 }),
        line,
        { type: 'page_number' },
        'garbage',
        text(),
      ]),
      PATH,
      'grid',
    );
    expect(ops?.[1]).toEqual({ op: 'setScalar', path: PATH, keys: ['box', 'columns'], value: 2 });
  });

  it('gives an empty row one column and caps a long row at the engine track limit', () => {
    expect(modeSwitchOps(container({ direction: 'row' }), PATH, 'grid')?.[1]).toMatchObject({
      value: 1,
    });
    const long = Array.from({ length: 70 }, () => text());
    expect(modeSwitchOps(container({ direction: 'row' }, long), PATH, 'grid')?.[1]).toMatchObject({
      value: 64,
    });
  });

  it('turns a stack into a one-column grid, removing direction only when authored', () => {
    // Unset direction is a stack too — and there is no key to remove.
    expect(modeSwitchOps(container({}, [text(), text()]), PATH, 'grid')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'type'], value: 'grid' },
      { op: 'setScalar', path: PATH, keys: ['box', 'columns'], value: 1 },
    ]);
    expect(modeSwitchOps(container({ direction: 'column' }, [text()]), PATH, 'grid')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'type'], value: 'grid' },
      { op: 'setScalar', path: PATH, keys: ['box', 'columns'], value: 1 },
      { op: 'removeKey', path: PATH, keys: ['box', 'direction'] },
    ]);
  });

  it('keeps the keys a grid also reads and the children flex keys (switching back restores them)', () => {
    const ops = modeSwitchOps(
      container({ direction: 'row', gap: 6, alignItems: 'center', justifyContent: 'end' }, [
        text({ flexGrow: 2, flexBasis: 0 }),
      ]),
      PATH,
      'grid',
    );
    const touched = (ops ?? []).map((op) => keysOf(op));
    expect(touched).toEqual(['box.type', 'box.columns', 'box.direction']);
    expect((ops ?? []).every((op) => op.path === PATH)).toBe(true);
  });
});

describe('modeSwitchOps — to a grid, as a column-track list', () => {
  const columnsOf = (ops: Op[] | null) => ops?.find((op) => keysOf(op) === 'box.columns');

  it('sizes each column the way its child was sized in the row', () => {
    const ops = switchWith(
      container({ direction: 'row' }, [
        text({ w: 200 }),
        text({ w: '30%' }),
        text({ flexGrow: 2 }),
        text(),
        { type: 'table', columns: [] },
        { type: 'list' },
        { type: 'text', spans: [{ text: 'a' }] },
        // An authored weight wins over the kind's default; a zero or hostile
        // weight is the content width, like an unset one on measurable text.
        { type: 'table', box: { flexGrow: 3 } },
        text({ flexGrow: 0 }),
        text({ flexGrow: 'x' }),
        // A width wins over a weight (the weight is inert on a sized child).
        text({ w: 40, flexGrow: 5 }),
      ]),
      PATH,
      'grid',
      LIST,
    );
    expect(columnsOf(ops)).toEqual({
      op: 'putValue',
      path: PATH,
      keys: ['box', 'columns'],
      value: [200, '30%', '2fr', 'auto', '1fr', '1fr', '1fr', '3fr', 'auto', 'auto', 40],
    });
  });

  it('lists only the children laid out by flex, and at most the engine track cap', () => {
    const ops = switchWith(
      container({ direction: 'row' }, [text({ x: 2 }), line, text({ w: 10 })]),
      PATH,
      'grid',
      LIST,
    );
    expect(columnsOf(ops)).toMatchObject({ value: [10] });
    const long = Array.from({ length: 70 }, () => text());
    const capped = columnsOf(switchWith(container({ direction: 'row' }, long), PATH, 'grid', LIST));
    expect(capped?.op === 'putValue' ? capped.value : null).toHaveLength(64);
  });

  it('falls back to one column when no child is laid out by flex, and for a stack', () => {
    expect(
      columnsOf(switchWith(container({ direction: 'row' }, [line]), PATH, 'grid', LIST)),
    ).toEqual({ op: 'setScalar', path: PATH, keys: ['box', 'columns'], value: 1 });
    expect(columnsOf(switchWith(container({}, [text({ w: 9 })]), PATH, 'grid', LIST))).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columns'],
      value: 1,
    });
  });
});

describe('modeSwitchOps — back to a row or a stack', () => {
  it('drops exactly the grid-only keys present and sets the direction', () => {
    const ops = modeSwitchOps(
      container({ type: 'grid', columns: 2, rows: 3, gap: 4 }, [text(), text()]),
      PATH,
      'row',
    );
    expect(ops).toEqual([
      { op: 'removeKey', path: PATH, keys: ['box', 'type'] },
      { op: 'removeKey', path: PATH, keys: ['box', 'columns'] },
      { op: 'removeKey', path: PATH, keys: ['box', 'rows'] },
      { op: 'setScalar', path: PATH, keys: ['box', 'direction'], value: 'row' },
    ]);
  });

  it('carries the gap that was winning on the new main axis into `gap`', () => {
    const grid = { type: 'grid', columns: 2, gap: 4, columnGap: 10, rowGap: '5%' };
    const gapOps = (ops: Op[]) => ops.filter((op) => keysOf(op) === 'box.gap');
    const toRow = modeSwitchOps(container(grid), PATH, 'row') ?? [];
    // The ONLY gap written is the main axis's — never the cross axis's too.
    expect(gapOps(toRow)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'gap'], value: 10 },
    ]);
    const toStack = modeSwitchOps(container(grid), PATH, 'column') ?? [];
    expect(gapOps(toStack)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'gap'], value: '5%' },
    ]);
    // Both per-axis keys go either way.
    for (const ops of [toRow, toStack]) {
      expect(ops).toContainEqual({ op: 'removeKey', path: PATH, keys: ['box', 'columnGap'] });
      expect(ops).toContainEqual({ op: 'removeKey', path: PATH, keys: ['box', 'rowGap'] });
    }
  });

  it('leaves `gap` alone when the main axis had no gap of its own, or a hostile one', () => {
    const onlyGap = modeSwitchOps(container({ type: 'grid', columns: 2, gap: 4 }), PATH, 'row');
    expect(onlyGap?.some((op) => keysOf(op) === 'box.gap')).toBe(false);
    const hostile = modeSwitchOps(
      container({ type: 'grid', columns: 2, columnGap: { x: 1 } }),
      PATH,
      'row',
    );
    expect(hostile?.some((op) => op.op === 'setScalar' && op.keys.join('.') === 'box.gap')).toBe(
      false,
    );
  });

  it('drops the children span keys — except where that would empty a required box', () => {
    const ops = modeSwitchOps(
      container({ type: 'grid', columns: 2 }, [
        text({ columnSpan: 2 }),
        text({ rowSpan: 2, columnSpan: 2, w: 40 }),
        // A rect whose box holds only the span: the op layer would prune the
        // emptied box, and a rect with no box does not parse — it keeps it.
        { type: 'rect', box: { columnSpan: 2 } },
        // A rect with a real box sheds the span like anyone else.
        { type: 'rect', box: { w: 10, h: 10, rowSpan: 2 } },
        text(),
        'garbage',
      ]),
      PATH,
      'column',
    );
    expect(ops?.filter((op) => op.path !== PATH)).toEqual([
      { op: 'removeKey', path: child(0), keys: ['box', 'columnSpan'] },
      { op: 'removeKey', path: child(1), keys: ['box', 'columnSpan'] },
      { op: 'removeKey', path: child(1), keys: ['box', 'rowSpan'] },
      { op: 'removeKey', path: child(3), keys: ['box', 'rowSpan'] },
    ]);
  });

  it('never deletes a child, whatever it switches between', () => {
    const items = [text({ columnSpan: 2 }), text(), text()];
    const read = container({ type: 'grid', columns: 2 }, items);
    for (const target of ['row', 'column'] as const) {
      expect(modeSwitchOps(read, PATH, target)?.some((op) => op.op === 'removeItem')).toBe(false);
    }
  });

  it('refuses a switch whose batch would pass the op cap, rather than doing part of it', () => {
    const many = Array.from({ length: MAX_BATCH_OPS }, () => text({ columnSpan: 2 }));
    expect(modeSwitchOps(container({ type: 'grid', columns: 2 }, many), PATH, 'row')).toBeNull();
  });
});

describe('modeSwitchOps — no switch', () => {
  it('authors nothing for the current mode, and one direction op between row and stack', () => {
    expect(modeSwitchOps(container({ direction: 'row' }), PATH, 'row')).toEqual([]);
    expect(modeSwitchOps(container({ type: 'grid', columns: 2 }), PATH, 'grid')).toEqual([]);
    expect(modeSwitchOps(container({ direction: 'row' }), PATH, 'column')).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'direction'], value: 'column' },
    ]);
  });

  it('refuses a node the panel shows no layout controls for', () => {
    expect(modeSwitchOps(reader({ [PATH]: { type: 'text' } }), PATH, 'grid')).toBeNull();
    expect(modeSwitchOps(container({ type: 'constructor' }), PATH, 'grid')).toBeNull();
    expect(modeSwitchOps(throwingRead, PATH, 'row')).toBeNull();
  });
});

describe('basisOps', () => {
  it('ticking starts every split child from zero and gives an unweighted one a weight of 1', () => {
    const ops = basisOps(
      container({ direction: 'row' }, [
        text(),
        text({ flexGrow: 2 }),
        text({ flexBasis: 0 }),
        text({ w: 40 }),
        text({ x: 4 }),
        'garbage',
        // A line has no `box` on the wire: a flex key on it would not parse.
        line,
        { type: 'page_break' },
      ]),
      PATH,
      true,
    );
    expect(ops).toEqual([
      { op: 'setScalar', path: child(0), keys: ['box', 'flexBasis'], value: 0 },
      { op: 'setScalar', path: child(0), keys: ['box', 'flexGrow'], value: 1 },
      // An authored weight is the author's — kept.
      { op: 'setScalar', path: child(1), keys: ['box', 'flexBasis'], value: 0 },
      // Already zero: only the missing weight.
      { op: 'setScalar', path: child(2), keys: ['box', 'flexGrow'], value: 1 },
    ]);
  });

  it('unticking removes only the zero bases — the weights stay where the inputs show them', () => {
    const ops = basisOps(
      container({ direction: 'row' }, [
        text({ flexBasis: 0, flexGrow: 1 }),
        text(),
        text({ flexBasis: 0, w: 40 }),
      ]),
      PATH,
      false,
    );
    expect(ops).toEqual([{ op: 'removeKey', path: child(0), keys: ['box', 'flexBasis'] }]);
  });

  it('refuses an unreadable container and a batch over the op cap', () => {
    expect(basisOps(throwingRead, PATH, true)).toBeNull();
    const many = Array.from({ length: MAX_BATCH_OPS }, () => text());
    expect(basisOps(container({ direction: 'row' }, many), PATH, true)).toBeNull();
  });
});

describe('the switches over a real document', () => {
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      # the totals row',
    '      - type: container',
    '        box: { direction: row, gap: 8 } # keep the gap',
    '        items:',
    '          - type: text # label',
    '            text: a',
    '          - type: text',
    '            text: b',
    '            box: { columnSpan: 2 }',
    '',
  ].join('\n');

  function apply(editor: Editor, ops: Op[] | null) {
    expect(ops).not.toBeNull();
    expect(editor.applyAll(ops as Op[]).ok).toBe(true);
  }

  it('touches only its own keys, keeps every comment, and one undo reverts each switch', () => {
    const editor = Editor.create(SOURCE);
    const read: ReadFn = (path) => editor.read(path);
    apply(editor, switchWith(read, PATH, 'grid', LIST));
    const asGrid = editor.text();
    // Every source line the switch had no business with survives VERBATIM:
    // only the container's own `box:` line may change.
    const untouched = SOURCE.split('\n').filter((l) => !l.includes('box: { direction: row'));
    const gridLines = asGrid.split('\n');
    for (const l of untouched) {
      expect(gridLines).toContain(l);
    }
    expect(asGrid).toContain('# keep the gap');
    expect(editor.read(`${PATH}.box`)).toEqual({
      gap: 8,
      type: 'grid',
      columns: ['auto', 'auto'],
    });

    apply(editor, switchWith(read, PATH, 'column', LIST));
    expect(editor.read(`${PATH}.box`)).toEqual({ gap: 8, direction: 'column' });
    // The span the grid read is gone, and the emptied child box with it; the
    // other lines are still the source's own.
    expect(editor.read(`${child(1)}.box`)).toBeUndefined();
    const stackLines = editor.text().split('\n');
    for (const l of untouched.filter((x) => !x.includes('columnSpan'))) {
      expect(stackLines).toContain(l);
    }

    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe(asGrid);
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe(SOURCE);
  });

  it('the split-by-ratio toggle is one undo step', () => {
    const editor = Editor.create(SOURCE);
    const read: ReadFn = (path) => editor.read(path);
    apply(editor, basisOps(read, PATH, true));
    expect(editor.read(`${child(0)}.box`)).toEqual({ flexBasis: 0, flexGrow: 1 });
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe(SOURCE);
  });
});
