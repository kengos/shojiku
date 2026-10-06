import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  gridColumnsPlan,
  gridRowCount,
  gridRowsPlan,
  MAX_GRID_COLS,
  MAX_GRID_ROWS,
} from './gridStructure';

const DEFAULT = 'テキスト';
const GRID = 'sections.body.items[0]';

/** A grid container with `columns` tracks and one text item per label. */
function gridSource(columns: number, labels: readonly string[]): string {
  const lines = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: container',
    `        box: { type: grid, columns: ${columns} }`,
    '        items:',
  ];
  for (const label of labels) {
    lines.push('          - type: text', `            text: ${label}`);
  }
  lines.push('');
  return lines.join('\n');
}

function texts(editor: Editor): string[] {
  const items = editor.read(`${GRID}.items`) as { text: string }[];
  return items.map((item) => item.text);
}

describe('gridColumnsPlan', () => {
  it('grows a rectangular grid, padding each row with placeholders (row-major preserved)', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c', 'd']));
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, 3, DEFAULT);
    expect(plan.drops).toBe(false);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.read(`${GRID}.box.columns`)).toBe(3);
    expect(texts(editor)).toEqual(['a', 'b', DEFAULT, 'c', 'd', DEFAULT]);
  });

  it('shrinks a grid, dropping each row trailing cell — flags content loss, ONE undo restores', () => {
    const source = gridSource(2, ['a', 'b', 'c', 'd']);
    const editor = Editor.create(source);
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(plan.drops).toBe(true);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.read(`${GRID}.box.columns`)).toBe(1);
    expect(texts(editor)).toEqual(['a', 'c']);
    // The whole re-chunk (removals + the columns rewrite) is one undo step.
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe(source);
    expect(editor.undo()).toBe(false);
  });

  it('shrinks silently (no content flag) when the dropped cells are placeholders', () => {
    const editor = Editor.create(gridSource(2, [DEFAULT, DEFAULT, DEFAULT, DEFAULT]));
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(plan.drops).toBe(false);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual([DEFAULT, DEFAULT]);
  });

  it('grows a ragged last row, padding both rows to the new width', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c']));
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, 3, DEFAULT);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual(['a', 'b', DEFAULT, 'c', DEFAULT, DEFAULT]);
    expect(editor.read(`${GRID}.box.columns`)).toBe(3);
  });

  it('clamps the target to [1, MAX_GRID_COLS] and no-ops an unchanged count', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c', 'd']));
    const read = (p: string) => editor.read(p);
    expect(gridColumnsPlan(read, GRID, 2, DEFAULT).ops).toHaveLength(0);
    // 0 clamps to 1 (a real shrink), 999 clamps to the cap (a real grow).
    expect(gridColumnsPlan(read, GRID, 0, DEFAULT).ops.length).toBeGreaterThan(0);
    const capped = gridColumnsPlan(read, GRID, 999, DEFAULT);
    expect(capped.ops.some((op) => op.op === 'setScalar')).toBe(true);
    expect(
      capped.ops.find((op): op is Extract<typeof op, { op: 'setScalar' }> => op.op === 'setScalar')
        ?.value,
    ).toBe(MAX_GRID_COLS);
  });

  it('clamps a non-finite target to 1 (the fail-closed floor)', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b']));
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, Number.NaN, DEFAULT);
    // NaN → 1: a real shrink from 2 columns.
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(editor.read(`${GRID}.box.columns`)).toBe(1);
  });

  it('reads a track LIST as its length and a garbage columns value as 1', () => {
    const listGrid = Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: container',
        '        box: { type: grid, columns: ["30%", "70%"] }',
        '        items:',
        '          - type: text',
        '            text: a',
        '          - type: text',
        '            text: b',
        '',
      ].join('\n'),
    );
    // 2 tracks → growing to 3 pads each row by one, and the LIST stays a list:
    // the new column copies the last track instead of the widths collapsing to
    // an equal count.
    const plan = gridColumnsPlan((p) => listGrid.read(p), GRID, 3, DEFAULT);
    expect(listGrid.applyAll(plan.ops).ok).toBe(true);
    expect(listGrid.read(`${GRID}.box.columns`)).toEqual(['30%', '70%', '70%']);
    // …and a shrink drops the trailing tracks, keeping the first ones verbatim.
    const shrink = gridColumnsPlan((p) => listGrid.read(p), GRID, 1, DEFAULT);
    expect(listGrid.applyAll(shrink.ops).ok).toBe(true);
    expect(listGrid.read(`${GRID}.box.columns`)).toEqual(['30%']);
    expect(listGrid.text()).toContain('"30%"');

    const garbage = Editor.create(gridSource(2, ['a']).replace('columns: 2', 'columns: garbage'));
    // Unresolvable columns read as 1 (the engine default) — rows = children.
    expect(gridRowCount((p) => garbage.read(p), GRID)).toBe(1);
  });

  it('no-ops on a non-grid container / a read throw', () => {
    const flex = Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: container',
        '        box: { direction: row }',
        '        items:',
        '          - type: text',
        '            text: a',
        '',
      ].join('\n'),
    );
    expect(gridColumnsPlan((p) => flex.read(p), GRID, 3, DEFAULT).ops).toHaveLength(0);
    const throwing = () => {
      throw new Error('bomb');
    };
    expect(gridColumnsPlan(throwing, GRID, 3, DEFAULT).ops).toHaveLength(0);
  });
});

describe('gridRowsPlan', () => {
  it('grows rows by appending whole placeholder rows (no box.rows key)', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c', 'd']));
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 3, DEFAULT);
    expect(plan.drops).toBe(false);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual(['a', 'b', 'c', 'd', DEFAULT, DEFAULT]);
    expect(editor.read(`${GRID}.box.columns`)).toBe(2);
    expect(editor.read(`${GRID}.box.rows`)).toBeUndefined();
  });

  it('shrinks rows by truncating trailing children — flags content loss', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c', 'd']));
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(plan.drops).toBe(true);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual(['a', 'b']);
    expect(editor.read(`${GRID}.box.rows`)).toBeUndefined();
  });

  it('shrinks silently when the truncated children are placeholders', () => {
    const editor = Editor.create(gridSource(2, [DEFAULT, DEFAULT, DEFAULT, DEFAULT]));
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(plan.drops).toBe(false);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual([DEFAULT, DEFAULT]);
  });

  it('grows a ragged grid to exactly target×cols cells (fills the ragged row)', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c']));
    // 3 items over 2 cols = 2 (ragged) rows; growing to 3 rows lands on 6 cells.
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 3, DEFAULT);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual(['a', 'b', 'c', DEFAULT, DEFAULT, DEFAULT]);
  });

  it('clamps to [1, MAX_GRID_ROWS] and no-ops an unchanged count', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c', 'd']));
    const read = (p: string) => editor.read(p);
    expect(gridRowsPlan(read, GRID, 2, DEFAULT).ops).toHaveLength(0);
    const capped = gridRowsPlan(read, GRID, 999, DEFAULT);
    // A grow to the cap appends (cap - 2) * 2 cells.
    expect(capped.ops).toHaveLength((MAX_GRID_ROWS - 2) * 2);
  });

  it('no-ops on a non-grid container / a read throw', () => {
    const throwing = () => {
      throw new Error('bomb');
    };
    expect(gridRowsPlan(throwing, GRID, 3, DEFAULT).ops).toHaveLength(0);
  });
});

describe('gridRowsPlan (no items key)', () => {
  it('grows a childless grid by appending into the auto-created items list', () => {
    const editor = Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: container',
        '        box: { type: grid, columns: 2 }',
        '',
      ].join('\n'),
    );
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual([DEFAULT, DEFAULT]);
  });
});

describe('gridRowCount', () => {
  it('reports ceil(children / columns)', () => {
    const editor = Editor.create(gridSource(2, ['a', 'b', 'c', 'd', 'e']));
    expect(gridRowCount((p) => editor.read(p), GRID)).toBe(3);
  });

  it('is null for a non-grid node', () => {
    const editor = Editor.create(gridSource(2, ['a']));
    expect(gridRowCount((p) => editor.read(p), 'sections.body')).toBeNull();
  });
});

/** A grid source with arbitrary child lines (each already indented as a list
 * entry under `items:`) and extra box keys. */
function gridWith(box: string, children: readonly string[]): string {
  return [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: container',
    `        box: { type: grid, ${box} }`,
    '        items:',
    ...children,
    '',
  ].join('\n');
}

const TEXT = (label: string) => [`          - type: text`, `            text: ${label}`];
const PLACED = [
  '          - type: text',
  '            text: placed',
  '            box: { x: 4, y: 4 }',
];
const LINE = [
  '          - type: line',
  '            from: { x: 0, y: 0 }',
  '            to: { x: 9, y: 0 }',
];

describe('grid plans over CELLS (children the grid lays out)', () => {
  it('neither counts, moves nor drops a positioned child or a line', () => {
    const editor = Editor.create(
      gridWith('columns: 2', [...TEXT('a'), ...PLACED, ...TEXT('b'), ...LINE, ...TEXT('c')]),
    );
    const read = (p: string) => editor.read(p);
    // Three cells in two columns: two rows, whatever else the list holds.
    expect(gridRowCount(read, GRID)).toBe(2);
    // Shrink to one column: only cell b (the second of row 1) goes.
    const plan = gridColumnsPlan(read, GRID, 1, DEFAULT);
    expect(plan.drops).toBe(true);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const items = editor.read(`${GRID}.items`) as { type: string; text?: string }[];
    expect(items.map((item) => item.text ?? item.type)).toEqual(['a', 'placed', 'line', 'c']);
  });

  it('pads a row right after its last cell, past a positioned child in between', () => {
    const editor = Editor.create(gridWith('columns: 1', [...TEXT('a'), ...PLACED, ...TEXT('b')]));
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, 2, DEFAULT);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const items = editor.read(`${GRID}.items`) as { text: string }[];
    expect(items.map((item) => item.text)).toEqual(['a', DEFAULT, 'placed', 'b', DEFAULT]);
  });

  it('a row shrink removes trailing cells only', () => {
    const editor = Editor.create(gridWith('columns: 1', [...TEXT('a'), ...TEXT('b'), ...LINE]));
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    const items = editor.read(`${GRID}.items`) as { type: string; text?: string }[];
    expect(items.map((item) => item.text ?? item.type)).toEqual(['a', 'line']);
  });
});

describe('grid row plans keep an authored rows key in step', () => {
  const rowsOf = (editor: Editor) => editor.read(`${GRID}.box.rows`);

  it('a row COUNT follows the new count both ways', () => {
    const editor = Editor.create(gridWith('columns: 1, rows: 2', [...TEXT('a'), ...TEXT('b')]));
    const read = (p: string) => editor.read(p);
    expect(editor.applyAll(gridRowsPlan(read, GRID, 3, DEFAULT).ops).ok).toBe(true);
    expect(rowsOf(editor)).toBe(3);
    expect(editor.applyAll(gridRowsPlan(read, GRID, 1, DEFAULT).ops).ok).toBe(true);
    expect(rowsOf(editor)).toBe(1);
  });

  it('a row LIST is trimmed when it would outlast the rows, and left alone on growth', () => {
    const editor = Editor.create(
      gridWith('columns: 1, rows: [20, auto, 30]', [...TEXT('a'), ...TEXT('b'), ...TEXT('c')]),
    );
    const read = (p: string) => editor.read(p);
    expect(editor.applyAll(gridRowsPlan(read, GRID, 4, DEFAULT).ops).ok).toBe(true);
    expect(rowsOf(editor)).toEqual([20, 'auto', 30]);
    expect(editor.applyAll(gridRowsPlan(read, GRID, 2, DEFAULT).ops).ok).toBe(true);
    expect(rowsOf(editor)).toEqual([20, 'auto']);
  });

  it('absent rows stay absent', () => {
    const editor = Editor.create(gridWith('columns: 1', [...TEXT('a')]));
    expect(editor.applyAll(gridRowsPlan((p) => editor.read(p), GRID, 2, DEFAULT).ops).ok).toBe(
      true,
    );
    expect(rowsOf(editor)).toBeUndefined();
  });
});

describe('grid plans in a down-then-across grid (direction: column)', () => {
  // 2 columns × 2 rows filled down first: column 0 = a, b; column 1 = c, d.
  const COLUMN_FILL = () =>
    Editor.create(
      gridWith('columns: 2, direction: column', [
        ...TEXT('a'),
        ...TEXT('b'),
        ...TEXT('c'),
        ...TEXT('d'),
      ]),
    );
  const texts = (editor: Editor) =>
    (editor.read(`${GRID}.items`) as { text: string }[]).map((item) => item.text);

  it('a column shrink drops the whole RIGHT column, not each row tail', () => {
    const editor = COLUMN_FILL();
    const plan = gridColumnsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual(['a', 'b']);
  });

  it('a row shrink drops the BOTTOM row: each column keeps its first cell', () => {
    const editor = COLUMN_FILL();
    const plan = gridRowsPlan((p) => editor.read(p), GRID, 1, DEFAULT);
    expect(plan.drops).toBe(true);
    expect(editor.applyAll(plan.ops).ok).toBe(true);
    expect(texts(editor)).toEqual(['a', 'c']);
  });

  it('a row grow pads every column in place, so no cell changes column', () => {
    const editor = COLUMN_FILL();
    expect(editor.applyAll(gridRowsPlan((p) => editor.read(p), GRID, 3, DEFAULT).ops).ok).toBe(
      true,
    );
    expect(texts(editor)).toEqual(['a', 'b', DEFAULT, 'c', 'd', DEFAULT]);
  });

  it('a column grow appends a whole column of placeholders', () => {
    const editor = COLUMN_FILL();
    expect(editor.applyAll(gridColumnsPlan((p) => editor.read(p), GRID, 3, DEFAULT).ops).ok).toBe(
      true,
    );
    expect(texts(editor)).toEqual(['a', 'b', 'c', 'd', DEFAULT, DEFAULT]);
    expect(editor.read(`${GRID}.box.columns`)).toBe(3);
  });
});

describe('a track-list resize is one undo step', () => {
  it('restores the list and the cells together', () => {
    const source = gridWith('columns: ["30%", "70%"]', [...TEXT('a'), ...TEXT('b')]);
    const editor = Editor.create(source);
    expect(editor.applyAll(gridColumnsPlan((p) => editor.read(p), GRID, 3, DEFAULT).ops).ok).toBe(
      true,
    );
    expect(editor.undo()).toBe(true);
    // (Compared as data: the YAML printer re-spaces a flow list it re-emits.)
    expect(editor.read(`${GRID}.box.columns`)).toEqual(['30%', '70%']);
    expect((editor.read(`${GRID}.items`) as unknown[]).length).toBe(2);
    expect(editor.undo()).toBe(false);
  });
});
