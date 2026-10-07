import { Editor, MAX_BATCH_OPS, type Op, type ReadFn } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import type { PlacedBox } from '../engine/types';
import { bandDeleteOp } from './BandDelete';
import { toFlowOps } from './bodyFlow';
import { type AbsolutePlan, BODY_PATH, bodyMode, toAbsoluteOps } from './bodyModel';
import type { PlacementGeometry } from './placementGeometry';

function reader(map: Record<string, unknown>): ReadFn {
  return (path) => (Object.hasOwn(map, path) ? map[path] : undefined);
}

const item = (i: number) => `${BODY_PATH}.items[${i}]`;

function bodyRead(body: Record<string, unknown>): ReadFn {
  const map: Record<string, unknown> = { [BODY_PATH]: body };
  const items = Array.isArray(body.items) ? body.items : [];
  items.forEach((child, i) => {
    map[item(i)] = child;
  });
  return reader(map);
}

function placed(path: string, x: number, y: number): PlacedBox {
  const rect = { x, y, w: 50, h: 10 };
  return { path, border: rect, content: rect };
}

/** Margins [top, right, bottom, left] = [20, 0, 0, 30]. */
function geometry(pages: PlacedBox[][], fresh = true): PlacementGeometry {
  return { boxes: { pages }, margin: [20, 0, 0, 30], fresh };
}

describe('bodyMode', () => {
  it('reads flow and absolute, and nothing else', () => {
    expect(bodyMode(bodyRead({ type: 'flow' }))).toBe('flow');
    expect(bodyMode(bodyRead({ type: 'absolute' }))).toBe('absolute');
    expect(bodyMode(bodyRead({ type: 'x' }))).toBeNull();
    expect(bodyMode(reader({}))).toBeNull();
  });
});

describe('toAbsoluteOps', () => {
  const flow = (items: unknown[], extra: Record<string, unknown> = {}) =>
    bodyRead({ type: 'flow', items, ...extra });
  const NONE = { pastFirstPage: 0, unplaced: 0, continued: 0, flowOnly: 0, tablePaging: 0 };

  it('pins each boxed child where the preview drew it, relative to the margins', () => {
    const read = flow([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b', box: { margin: 4 } },
    ]);
    const plan = <AbsolutePlan>(
      toAbsoluteOps(read, geometry([[placed(item(0), 30, 20), placed(item(1), 64, 54)]]))
    );
    expect(plan.ops).toEqual([
      { op: 'setScalar', path: BODY_PATH, keys: ['type'], value: 'absolute' },
      { op: 'setScalar', path: item(0), keys: ['box', 'x'], value: 0 },
      { op: 'setScalar', path: item(0), keys: ['box', 'y'], value: 0 },
      // The child's own margin is added back by the engine, so it comes off.
      { op: 'setScalar', path: item(1), keys: ['box', 'x'], value: 30 },
      { op: 'setScalar', path: item(1), keys: ['box', 'y'], value: 30 },
    ]);
    expect(plan.loss).toEqual(NONE);
  });

  it('removes a table pagination settings (flow-only) and counts the table', () => {
    const read = flow([
      { type: 'table', repeatHeader: true, keepTogether: false, columns: [] },
      { type: 'table', columns: [] },
    ]);
    const plan = <AbsolutePlan>(
      toAbsoluteOps(read, geometry([[placed(item(0), 30, 20), placed(item(1), 30, 60)]]))
    );
    expect(plan.ops).toContainEqual({ op: 'removeKey', path: item(0), keys: ['repeatHeader'] });
    expect(plan.ops).toContainEqual({ op: 'removeKey', path: item(0), keys: ['keepTogether'] });
    expect(plan.ops.filter((op) => op.path === item(1) && op.op === 'removeKey')).toEqual([]);
    expect(plan.loss.tablePaging).toBe(1);
  });

  it('drops the flow-only body keys an absolute body refuses', () => {
    const plan = <AbsolutePlan>toAbsoluteOps(flow([], { gap: 8, box: { y: 10 } }), geometry([[]]));
    expect(plan.ops.slice(0, 2)).toEqual([
      { op: 'removeKey', path: BODY_PATH, keys: ['gap'] },
      { op: 'removeKey', path: BODY_PATH, keys: ['box'] },
    ]);
  });

  it('deletes what was only on later pages, and counts every other change', () => {
    const read = flow([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'repeat_flow', data: { key: 'r' }, item: {} },
      { type: 'page_break' },
      'garbage',
      { type: 'text', text: 'hidden under the sample' },
      { type: 'table', columns: [] },
      { type: 'text', text: 'also on page 2' },
    ]);
    const plan = <AbsolutePlan>toAbsoluteOps(
      read,
      geometry([
        [placed(item(0), 30, 20), placed(item(6), 30, 40)],
        [placed(item(1), 30, 20), placed(item(6), 30, 20), placed(item(7), 30, 40)],
      ]),
    );
    expect(plan.loss).toEqual({
      pastFirstPage: 2,
      unplaced: 1,
      continued: 1,
      flowOnly: 2,
      tablePaging: 0,
    });
    // The page-1 children are pinned (a table that continues included); the
    // later-page ones are removed last, from the end, so no path shifts.
    const pinned = plan.ops.filter((op) => op.op === 'setScalar' && op.path !== BODY_PATH);
    expect(pinned.map((op) => op.path)).toEqual([item(0), item(0), item(6), item(6)]);
    expect(plan.ops.slice(-2)).toEqual([
      { op: 'removeItem', path: `${BODY_PATH}.items`, index: 7 },
      { op: 'removeItem', path: `${BODY_PATH}.items`, index: 1 },
    ]);
  });

  it('pins a line by its endpoints; an anchored one stays, an unreadable one is counted', () => {
    const read = flow([
      { type: 'line', from: { x: 0, y: 4 }, to: { x: '10mm', y: 4 } },
      { type: 'line', from: { item: 'title' }, to: { x: 9, y: 0 } },
      { type: 'line', from: { x: '50%', y: 0 }, to: { x: 9, y: 0 } },
      { type: 'line', to: { x: 9 } },
    ]);
    const plan = <AbsolutePlan>(
      toAbsoluteOps(
        read,
        geometry([
          [
            placed(item(0), 30, 120),
            placed(item(1), 30, 20),
            placed(item(2), 30, 20),
            placed(item(3), 40, 50),
          ],
        ]),
      )
    );
    expect(plan.ops.filter((op) => op.path === item(0))).toEqual([
      { op: 'setScalar', path: item(0), keys: ['from', 'x'], value: 0 },
      { op: 'setScalar', path: item(0), keys: ['from', 'y'], value: 100 },
      { op: 'setScalar', path: item(0), keys: ['to', 'x'], value: 28.35 },
      { op: 'setScalar', path: item(0), keys: ['to', 'y'], value: 100 },
    ]);
    expect(plan.ops.filter((op) => op.path === item(1) || op.path === item(2))).toEqual([]);
    // Missing endpoint keys read as 0.
    expect(
      plan.ops.filter((op) => op.path === item(3)).map((op) => 'value' in op && op.value),
    ).toEqual([10, 30, 19, 30]);
    expect(plan.loss.unplaced).toBe(1);
  });

  it('refuses without geometry, with stale geometry, and for a body that is not flowing', () => {
    const read = flow([{ type: 'text', text: 'a' }]);
    expect(toAbsoluteOps(read, null)).toBeNull();
    expect(toAbsoluteOps(read, geometry([[placed(item(0), 30, 20)]], false))).toBeNull();
    expect(toAbsoluteOps(bodyRead({ type: 'absolute', items: [] }), geometry([[]]))).toBeNull();
  });

  it('pins a child with an unreadable margin from its border, and reads a body with no items', () => {
    const read = flow([{ type: 'text', text: 'a', box: { margin: { left: 'wide' } } }]);
    const plan = <AbsolutePlan>toAbsoluteOps(read, geometry([[placed(item(0), 40, 30)]]));
    expect(plan.ops.slice(-2)).toEqual([
      { op: 'setScalar', path: item(0), keys: ['box', 'x'], value: 10 },
      { op: 'setScalar', path: item(0), keys: ['box', 'y'], value: 10 },
    ]);
    expect((<AbsolutePlan>toAbsoluteOps(bodyRead({ type: 'flow' }), geometry([[]]))).ops).toEqual([
      { op: 'setScalar', path: BODY_PATH, keys: ['type'], value: 'absolute' },
    ]);
  });

  it('refuses a batch over the op cap', () => {
    const items = Array.from({ length: MAX_BATCH_OPS }, () => ({ type: 'text', text: 'a' }));
    const pages = [items.map((_, i) => placed(item(i), 30, 20))];
    expect(toAbsoluteOps(flow(items), geometry(pages))).toBe('tooMany');
  });
});

describe('toFlowOps', () => {
  const placedBody = (items: unknown[]) => bodyRead({ type: 'absolute', items });

  it('reorders the children top to bottom, then left to right, and drops the y', () => {
    const ops = toFlowOps(
      placedBody([
        { type: 'text', text: 'c', box: { x: 0, y: 200 } },
        { type: 'text', text: 'b', box: { x: 50, y: 10 } },
        { type: 'text', text: 'a', box: { x: 0, y: 10 } },
        { type: 'text', text: 'no box' },
      ]),
    );
    expect(ops).toEqual([
      { op: 'setScalar', path: BODY_PATH, keys: ['type'], value: 'flow' },
      // No region: the child with no `y` sits at the margin's top already.
      // Sorted order: no box (y 0), a (0,10), b (50,10), c (0,200).
      { op: 'moveItem', path: `${BODY_PATH}.items`, from: 3, to: 0 },
      { op: 'moveItem', path: `${BODY_PATH}.items`, from: 3, to: 1 },
      { op: 'moveItem', path: `${BODY_PATH}.items`, from: 3, to: 2 },
      { op: 'removeKey', path: item(1), keys: ['box', 'y'] },
      { op: 'removeKey', path: item(2), keys: ['box', 'y'] },
      { op: 'removeKey', path: item(3), keys: ['box', 'y'] },
    ]);
  });

  it('keeps the order of children at the same position, and a required box whole', () => {
    const ops = toFlowOps(
      placedBody([
        { type: 'rect', box: { y: 5 } },
        { type: 'rect', box: { y: 5, w: 10, h: 10 } },
      ]),
    );
    expect(ops).toEqual([
      { op: 'setScalar', path: BODY_PATH, keys: ['type'], value: 'flow' },
      {
        op: 'putValue',
        path: BODY_PATH,
        keys: ['box'],
        value: { x: 0, y: 5, w: '100%', h: 786.89 },
      },
      { op: 'removeKey', path: item(1), keys: ['box', 'y'] },
    ]);
  });

  it('keeps the topmost item where it was: a region from its y to above the footer', () => {
    const page = (footer: unknown, items: unknown[]) =>
      reader({
        [BODY_PATH]: { type: 'absolute', items },
        page: { size: 'A4', margin: 25 },
        'sections.footer': footer,
        ...Object.fromEntries(items.map((child, i) => [item(i), child])),
      });
    const region = (read: ReadFn) =>
      (<Op[]>toFlowOps(read)).find((op) => op.op === 'putValue' && op.keys[0] === 'box');
    const items = [
      { type: 'text', box: { x: 0, y: 120 } },
      { type: 'text', box: { x: 0, y: 74 } },
    ];
    expect(region(page({ height: 46 }, items))).toEqual({
      op: 'putValue',
      path: BODY_PATH,
      keys: ['box'],
      value: { x: 0, y: 74, w: '100%', h: 671.89 },
    });
    // No footer band (or an unreadable height) ends the region at the margin.
    expect(region(page({ height: '1in' }, items))).toMatchObject({ value: { h: 717.89 } });
    expect(region(page(undefined, items))).toMatchObject({ value: { h: 717.89 } });
    // Nothing below the margin's top, a top past the bottom, no page size,
    // or no numeric y: no region.
    expect(region(page(undefined, [{ type: 'text', box: { y: 0 } }]))).toBeUndefined();
    expect(region(page(undefined, [{ type: 'text', box: { y: 900 } }]))).toBeUndefined();
    expect(region(page(undefined, [{ type: 'text', box: { y: '1in' } }]))).toBeUndefined();
    expect(
      region(reader({ [BODY_PATH]: { type: 'absolute', items }, page: { size: 'B9' } })),
    ).toBeUndefined();
  });

  it('stacks a line at its top endpoint and moves both endpoints up by it', () => {
    const ops = toFlowOps(
      placedBody([
        { type: 'text', text: 'a', box: { x: 0, y: 10 } },
        { type: 'line', from: { x: 0, y: 40 }, to: { x: 90, y: 44 } },
        { type: 'line', from: { x: 0, y: 0 }, to: { x: 90, y: 0 } },
        { type: 'line', from: { item: 'a' }, to: { x: 9, y: 300 } },
      ]),
    );
    // Order: the y-0 line and the anchored line (both 0), then a, then the
    // y-40 line; only that one is rebased.
    expect((ops as Op[]).filter((op) => 'keys' in op && op.keys[0] !== 'type')).toEqual([
      { op: 'removeKey', path: item(2), keys: ['box', 'y'] },
      { op: 'setScalar', path: item(3), keys: ['from', 'x'], value: 0 },
      { op: 'setScalar', path: item(3), keys: ['from', 'y'], value: 0 },
      { op: 'setScalar', path: item(3), keys: ['to', 'x'], value: 90 },
      { op: 'setScalar', path: item(3), keys: ['to', 'y'], value: 4 },
    ]);
  });

  it('refuses a body that is not placed, and a batch over the cap', () => {
    expect(toFlowOps(bodyRead({ type: 'flow', items: [] }))).toBeNull();
    const items = Array.from({ length: MAX_BATCH_OPS + 1 }, () => ({
      type: 'text',
      box: { y: 1 },
    }));
    expect(toFlowOps(placedBody(items))).toBe('tooMany');
  });
});

describe('the switches over a real document', () => {
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: absolute',
    '    items:',
    '      - type: text # the second line',
    '        text: second',
    '        box: { x: 0, y: 40, w: 100 }',
    '      - type: text # the title',
    '        text: title',
    '        box: { x: 0, y: 0, w: 100 }',
    '',
  ].join('\n');

  it('to flow: the title first, the y gone, the comments kept, one undo', () => {
    const editor = Editor.create(SOURCE);
    const ops = toFlowOps((p) => editor.read(p)) as Op[];
    expect(editor.applyAll(ops).ok).toBe(true);
    expect(editor.read(`${BODY_PATH}.type`)).toBe('flow');
    expect((editor.read(`${BODY_PATH}.items`) as { text: string }[]).map((i) => i.text)).toEqual([
      'title',
      'second',
    ]);
    expect(editor.read(`${item(0)}.box`)).toEqual({ x: 0, w: 100 });
    expect(editor.text()).toContain('# the title');
    expect(editor.undo()).toBe(true);
    expect(editor.read(`${BODY_PATH}.type`)).toBe('absolute');
    expect(editor.undo()).toBe(false);
  });

  it('to fixed position, and a band delete: one undo restores each whole', () => {
    const editor = Editor.create(
      [
        'sections:',
        '  header: { height: 30, items: [{ type: text, text: H }] }',
        '  body:',
        '    type: flow',
        '    gap: 8',
        '    box: { x: 0, y: 40, w: "100%", h: 600 }',
        '    items:',
        '      - { type: text, text: a }',
        '      - { type: text, text: b }',
        '',
      ].join('\n'),
    );
    // Compared as data: undo may re-space a flow-style YAML list.
    const before = editor.read('sections');
    const plan = <AbsolutePlan>(
      toAbsoluteOps(
        (p) => editor.read(p),
        geometry([[placed(item(0), 30, 60)], [placed(item(1), 30, 60)]]),
      )
    );
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.read(BODY_PATH)).toEqual({
      type: 'absolute',
      items: [{ type: 'text', text: 'a', box: { x: 0, y: 40 } }],
    });
    expect(editor.undo()).toBe(true);
    expect(editor.read('sections')).toEqual(before);
    expect(editor.apply(bandDeleteOp('header')).ok).toBe(true);
    expect(editor.read('sections.header')).toBeUndefined();
    expect(editor.undo()).toBe(true);
    expect(editor.read('sections')).toEqual(before);
    expect(editor.undo()).toBe(false);
  });
});
