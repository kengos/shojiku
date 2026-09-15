// @vitest-environment node
//
// The n-up grid model: what the panel reads off a `repeat` (hostile shapes
// included) and every op its controls can author — and every value they must
// refuse. The sheet cap is pinned to the engine's own constant.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  countSteppable,
  cutMarksOp,
  fillOrderOp,
  gridCountOp,
  gridCountStepOp,
  gridGapOp,
  gridGapStepOp,
  MAX_CELLS_PER_SHEET,
  newPageOp,
  readRepeatGrid,
} from './repeatGrid';

const P = 'sections.body.items[0]';
const at = (node: unknown) => (path: string) => (path === P ? node : undefined);

describe('readRepeatGrid', () => {
  it('reads every authored key', () => {
    const view = readRepeatGrid(
      at({
        type: 'repeat',
        breakBefore: 'auto',
        cutMarks: true,
        grid: { columns: 3, rows: 4, direction: 'column', gap: 6, columnGap: '5mm', rowGap: 12 },
      }),
      P,
    );
    expect(view).toEqual({
      columns: '3',
      rows: '4',
      columnGap: '5mm',
      rowGap: '12',
      gap: '6',
      direction: 'column',
      startsOnNewPage: false,
      cutMarks: true,
    });
  });

  it('reads an unset sheet as the engine defaults', () => {
    expect(readRepeatGrid(at({ type: 'repeat', data: { key: 'rows' } }), P)).toEqual({
      columns: '',
      rows: '',
      columnGap: '',
      rowGap: '',
      gap: '',
      direction: 'row',
      startsOnNewPage: true,
      cutMarks: false,
    });
  });

  it('degrades hostile shapes to the defaults, never echoing garbage as a choice', () => {
    const defaults = readRepeatGrid(at(undefined), P);
    const hostile = readRepeatGrid(
      at({
        grid: ['columns', 3],
        breakBefore: { page: true },
        cutMarks: 'true',
      }),
      P,
    );
    expect(hostile).toEqual(defaults);
    expect(readRepeatGrid(at({ grid: 'wide' }), P)).toEqual(defaults);
    expect(readRepeatGrid(at({ grid: { direction: 'diagonal', columns: { n: 2 } } }), P)).toEqual(
      defaults,
    );
    expect(readRepeatGrid(at([1, 2]), P)).toEqual(defaults);
    const throwing = () => {
      throw new Error('alias bomb');
    };
    expect(readRepeatGrid(throwing, P)).toEqual(defaults);
  });
});

describe('gridCountOp', () => {
  it('authors a whole count and clears an empty one back to the engine default', () => {
    expect(gridCountOp(P, 'columns', ' 3 ', '')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columns'],
      value: 3,
    });
    expect(gridCountOp(P, 'rows', '  ', '2')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'rows'],
    });
  });

  it('refuses anything that is not a whole number of at least one', () => {
    for (const raw of ['0', '-1', '1.5', 'abc', '1e309', 'Infinity', 'NaN']) {
      expect(gridCountOp(P, 'columns', raw, ''), raw).toBeNull();
    }
  });

  it('refuses a sheet past the engine cap, measured against the OTHER axis as authored', () => {
    expect(gridCountOp(P, 'columns', '8', '8')).not.toBeNull();
    expect(gridCountOp(P, 'columns', '9', '8')).toBeNull();
    // An unset other axis is the engine's 1…
    expect(gridCountOp(P, 'rows', '64', '')).not.toBeNull();
    expect(gridCountOp(P, 'rows', '65', '')).toBeNull();
    // …and so is one the engine could not read, rather than a reason to refuse.
    expect(gridCountOp(P, 'rows', '64', 'garbage')).not.toBeNull();
  });
});

describe('gridCountStepOp', () => {
  it('steps from the EFFECTIVE value, so an unset count steps up from one', () => {
    expect(gridCountStepOp(P, 'columns', '', 1, '')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columns'],
      value: 2,
    });
    expect(gridCountStepOp(P, 'rows', '4', -1, '2')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'rows'],
      value: 3,
    });
  });

  it('cannot step below one, past the cap, or from a value it cannot read', () => {
    expect(gridCountStepOp(P, 'columns', '1', -1, '')).toBeNull();
    expect(gridCountStepOp(P, 'columns', '8', 1, '8')).toBeNull();
    expect(gridCountStepOp(P, 'columns', 'abc', 1, '')).toBeNull();
  });

  it('reports which counts the ▲▼ can act on', () => {
    expect(countSteppable('')).toBe(true);
    expect(countSteppable('3')).toBe(true);
    expect(countSteppable('0')).toBe(false);
    expect(countSteppable('2.5')).toBe(false);
  });
});

describe('the other grid ops', () => {
  it('authors a gap with its unit, and clears an empty one', () => {
    expect(gridGapOp(P, 'columnGap', '12')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: 12,
    });
    expect(gridGapOp(P, 'rowGap', '5mm')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'rowGap'],
      value: '5mm',
    });
    expect(gridGapOp(P, 'rowGap', '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'rowGap'],
    });
  });

  it('keeps a relative gap, which this wire resolves against the region', () => {
    expect(gridGapOp(P, 'columnGap', '5%')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: '5%',
    });
  });

  it('authors 0 for a negative gap, absolute or relative, and nothing for garbage or a hostile size', () => {
    const zero = { op: 'setScalar', path: P, keys: ['grid', 'rowGap'], value: 0 };
    expect(gridGapOp(P, 'rowGap', '-4')).toEqual(zero);
    expect(gridGapOp(P, 'rowGap', '-2mm')).toEqual(zero);
    expect(gridGapOp(P, 'rowGap', '-5%')).toEqual(zero);
    for (const raw of ['abc', '-abc', '12px', '1e309', '10001']) {
      expect(gridGapOp(P, 'rowGap', raw), raw).toBeNull();
    }
    expect(gridGapOp(P, 'rowGap', '10000')).not.toBeNull();
  });

  it('steps a gap in its unit and never below zero', () => {
    expect(gridGapStepOp(P, 'columnGap', '2mm', 1, 1)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: expect.stringMatching(/mm$/),
    });
    expect(gridGapStepOp(P, 'columnGap', '1', -1, 2)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'columnGap'],
      value: 0,
    });
    expect(gridGapStepOp(P, 'columnGap', '', 1, 1)).toBeNull();
    expect(gridGapStepOp(P, 'columnGap', '5%', 1, 1)).toBeNull();
  });

  it('never authors a default: row order, a new page, no cut marks', () => {
    expect(fillOrderOp(P, 'row')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'direction'],
    });
    expect(fillOrderOp(P, 'column')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'direction'],
      value: 'column',
    });
    expect(newPageOp(P, true)).toEqual({ op: 'removeKey', path: P, keys: ['breakBefore'] });
    expect(newPageOp(P, false)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['breakBefore'],
      value: 'auto',
    });
    expect(cutMarksOp(P, true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['cutMarks'],
      value: true,
    });
    expect(cutMarksOp(P, false)).toEqual({ op: 'removeKey', path: P, keys: ['cutMarks'] });
  });
});

describe('the sheet cap stays pinned to the engine', () => {
  it('equals MAX_IMPOSITION_PER_PAGE in imposition.rs', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../../../engine/core/src/template/imposition.rs', import.meta.url)),
      'utf8',
    );
    const found = /pub const MAX_IMPOSITION_PER_PAGE: usize = (\d+);/.exec(src);
    // The control: a regex that stopped matching must fail, not compare to nothing.
    expect(found).not.toBeNull();
    expect(Number(found?.[1])).toBe(MAX_CELLS_PER_SHEET);
  });
});
