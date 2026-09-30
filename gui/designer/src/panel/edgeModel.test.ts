// Tests for edgeModel.ts + edgeOps.ts — a padding or margin read as one all-sides value plus
// four sides, and the ops each field authors: a leaf op on a map (siblings
// untouched), one expanding batch over the all-sides number, and a refusal for
// anything the wire rejects.

import { describe, expect, it } from 'vitest';
import { EDGE_SIDES, type EdgeRules, edgeSteppable, readEdge, steppedEdge } from './edgeModel';
import { edgeSideOps, edgeSideStepOps, edgeUniformOps, edgeUniformStepOps } from './edgeOps';

const P = 'sections.body.items[0]';
const PADDING: EdgeRules = { negative: false, auto: new Set(), sides: EDGE_SIDES };
const MARGIN: EdgeRules = { negative: true, auto: new Set(['left', 'right']), sides: EDGE_SIDES };
const node = (edge: unknown, key = 'padding') => ({ type: 'text', box: { [key]: edge } });

describe('readEdge', () => {
  it('reads unset, including a node with no box or a hostile one', () => {
    for (const n of [undefined, null, 'x', [], { type: 'text' }, { box: 'x' }, { box: {} }]) {
      expect(readEdge(n, 'padding')).toEqual({
        mode: 'none',
        uniform: '',
        sides: { top: '', right: '', bottom: '', left: '' },
      });
    }
  });

  it('reads one number as the all-sides value on every side', () => {
    expect(readEdge(node(6), 'padding')).toEqual({
      mode: 'uniform',
      uniform: '6',
      sides: { top: '6', right: '6', bottom: '6', left: '6' },
    });
  });

  it('reads a map side by side, verbatim, with an unset side blank', () => {
    expect(readEdge(node({ top: 4, left: '2mm', right: 'auto' }, 'margin'), 'margin')).toEqual({
      mode: 'perSide',
      uniform: '',
      sides: { top: '4', right: 'auto', bottom: '', left: '2mm' },
    });
  });

  it('never reads an inherited side, and blanks a side it cannot show', () => {
    const map = JSON.parse('{"__proto__": {"top": 9}, "left": {"x": 1}, "right": null}');
    expect(readEdge(node(map), 'padding').sides).toEqual({
      top: '',
      right: '',
      bottom: '',
      left: '',
    });
    expect(readEdge(node({ top: Number.NaN }), 'padding').sides.top).toBe('');
  });

  it('reads a form neither field can show as other', () => {
    expect(readEdge(node('4mm'), 'padding').mode).toBe('other');
    expect(readEdge(node(Number.POSITIVE_INFINITY), 'padding').mode).toBe('other');
    expect(readEdge(node([1, 2]), 'padding').mode).toBe('other');
  });
});

describe('edgeSideOps', () => {
  it('edits one side of a map with a leaf op, so the others stay byte-exact', () => {
    const view = readEdge(node({ top: 4, left: '2mm' }), 'padding');
    expect(edgeSideOps(P, 'padding', view, 'right', '3mm', PADDING)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding', 'right'], value: '3mm' },
    ]);
    expect(edgeSideOps(P, 'padding', view, 'top', ' 5 ', PADDING)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding', 'top'], value: 5 },
    ]);
  });

  it('expands the all-sides number into a map, keeping its value on the other sides', () => {
    expect(edgeSideOps(P, 'padding', readEdge(node(6), 'padding'), 'top', '10', PADDING)).toEqual([
      {
        op: 'putValue',
        path: P,
        keys: ['box', 'padding'],
        value: { top: 10, right: 6, bottom: 6, left: 6 },
      },
    ]);
  });

  it('starts a one-side map from unset (the other sides already mean 0)', () => {
    for (const edge of [undefined, '4mm']) {
      const view = readEdge(edge === undefined ? { type: 'text' } : node(edge), 'padding');
      expect(edgeSideOps(P, 'padding', view, 'left', '5%', PADDING)).toEqual([
        { op: 'putValue', path: P, keys: ['box', 'padding'], value: { left: '5%' } },
      ]);
    }
  });

  it('clears one side, and the whole key with the last one', () => {
    const two = readEdge(node({ top: 4, left: 2 }), 'padding');
    expect(edgeSideOps(P, 'padding', two, 'top', '', PADDING)).toEqual([
      { op: 'removeKey', path: P, keys: ['box', 'padding', 'top'] },
    ]);
    const one = readEdge(node({ top: 4 }), 'padding');
    expect(edgeSideOps(P, 'padding', one, 'top', ' ', PADDING)).toEqual([
      { op: 'removeKey', path: P, keys: ['box', 'padding'] },
    ]);
  });

  it('clearing a side of the all-sides number keeps it on the other three', () => {
    expect(edgeSideOps(P, 'padding', readEdge(node(6), 'padding'), 'left', '', PADDING)).toEqual([
      { op: 'putValue', path: P, keys: ['box', 'padding'], value: { top: 6, right: 6, bottom: 6 } },
    ]);
  });

  it('authors nothing for an unchanged entry or a clear of an empty side', () => {
    expect(edgeSideOps(P, 'padding', readEdge(node(6), 'padding'), 'top', '6', PADDING)).toBeNull();
    expect(edgeSideOps(P, 'padding', readEdge({}, 'padding'), 'top', '', PADDING)).toBeNull();
  });

  it('refuses a negative padding, a unit the wire lacks, garbage and a hostile length', () => {
    const view = readEdge({}, 'padding');
    for (const bad of ['-3', '-2mm', '5px', 'abc', '1e3', '5 mm', 'auto', '1'.repeat(17)]) {
      expect(edgeSideOps(P, 'padding', view, 'top', bad, PADDING)).toBeNull();
    }
  });

  it('lets a margin go negative, and take auto only on the sides that use it', () => {
    const view = readEdge({}, 'margin');
    expect(edgeSideOps(P, 'margin', view, 'top', '-4', MARGIN)).toEqual([
      { op: 'putValue', path: P, keys: ['box', 'margin'], value: { top: -4 } },
    ]);
    expect(edgeSideOps(P, 'margin', view, 'left', 'auto', MARGIN)).toEqual([
      { op: 'putValue', path: P, keys: ['box', 'margin'], value: { left: 'auto' } },
    ]);
    expect(edgeSideOps(P, 'margin', view, 'top', 'auto', MARGIN)).toBeNull();
  });

  it('writes a negative zero as 0', () => {
    expect(edgeSideOps(P, 'margin', readEdge({}, 'margin'), 'top', '-0', MARGIN)).toEqual([
      { op: 'putValue', path: P, keys: ['box', 'margin'], value: { top: 0 } },
    ]);
  });
});

describe('edgeUniformOps', () => {
  it('sets one number over any form, and removes on empty', () => {
    const map = readEdge(node({ top: 4 }), 'padding');
    expect(edgeUniformOps(P, 'padding', map, '8', PADDING)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 8 },
    ]);
    expect(edgeUniformOps(P, 'padding', map, '', PADDING)).toEqual([
      { op: 'removeKey', path: P, keys: ['box', 'padding'] },
    ]);
  });

  it('authors nothing unchanged, empty over unset, or outside the grammar', () => {
    const six = readEdge(node(6), 'padding');
    expect(edgeUniformOps(P, 'padding', six, '6', PADDING)).toBeNull();
    expect(edgeUniformOps(P, 'padding', readEdge({}, 'padding'), '', PADDING)).toBeNull();
    for (const bad of ['4mm', '-1', 'x', '9'.repeat(17)]) {
      expect(edgeUniformOps(P, 'padding', six, bad, PADDING)).toBeNull();
    }
  });

  it('takes a signed margin, and a negative zero as 0', () => {
    const view = readEdge({}, 'margin');
    expect(edgeUniformOps(P, 'margin', view, '-5', MARGIN)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'margin'], value: -5 },
    ]);
    expect(edgeUniformOps(P, 'margin', view, '-0', MARGIN)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'margin'], value: 0 },
    ]);
  });
});

describe('stepping', () => {
  it('steps unset, a number or an absolute unit, never a relative unit or a keyword', () => {
    expect(edgeSteppable('')).toBe(true);
    expect(edgeSteppable('4.5')).toBe(true);
    expect(edgeSteppable('4mm')).toBe(true);
    expect(edgeSteppable('10%')).toBe(false);
    expect(edgeSteppable('1em')).toBe(false);
    expect(edgeSteppable('auto')).toBe(false);
    expect(steppedEdge('10%', 1, PADDING)).toBeNull();
  });

  it('steps an absolute unit in its own unit, and floors a padding at 0', () => {
    expect(steppedEdge('4mm', 1, PADDING)).toMatch(/^4\.\d+mm$/);
    expect(steppedEdge('0.2mm', -1, PADDING)).toBe('0');
    expect(steppedEdge('0mm', -1, PADDING)).toBeNull();
    expect(steppedEdge('0mm', -1, MARGIN)).toMatch(/^-0\.\d+mm$/);
  });

  it('moves a point, from 0 when unset', () => {
    expect(steppedEdge('', 1, PADDING)).toBe('1');
    expect(steppedEdge('4', -1, PADDING)).toBe('3');
  });

  it('authors nothing when a step cannot move a huge value', () => {
    expect(steppedEdge('100000000000000000000', 1, PADDING)).toBeNull();
  });

  it('steps a side and the all-sides value through the commit rules', () => {
    const view = readEdge(node({ top: 4 }), 'padding');
    expect(edgeSideStepOps(P, 'padding', view, 'top', 1, PADDING)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding', 'top'], value: 5 },
    ]);
    expect(edgeSideStepOps(P, 'padding', view, 'right', -1, PADDING)).toBeNull();
    const six = readEdge(node(6), 'padding');
    expect(edgeUniformStepOps(P, 'padding', six, 1, PADDING)).toEqual([
      { op: 'setScalar', path: P, keys: ['box', 'padding'], value: 7 },
    ]);
    expect(edgeUniformStepOps(P, 'padding', readEdge(node(0), 'padding'), -1, PADDING)).toBeNull();
  });

  it('stops a padding at 0 and lets a margin go below it', () => {
    expect(steppedEdge('', -1, PADDING)).toBeNull();
    expect(steppedEdge('0', -1, PADDING)).toBeNull();
    expect(steppedEdge('0.5', -1, PADDING)).toBe('0');
    expect(steppedEdge('0', -1, MARGIN)).toBe('-1');
  });
});
