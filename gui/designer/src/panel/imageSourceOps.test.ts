// The image source switch plans: the ops each direction writes, what each
// remembers, and — applied to a real Editor — that every plan leaves the item
// with exactly one of `src` / `data`.

import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  imageSourceMode,
  imageToDataOps,
  imageToFixedOps,
  keepsItemPaths,
  planImageSwitch,
} from './imageSourceOps';

const P = 'sections.body.items[0]';

const fixed = { hasSrc: true, src: 'logo.svg', hasData: false, dataKey: '', dataScope: '' };
const bound = {
  hasSrc: false,
  src: '',
  hasData: true,
  dataKey: 'shop.logo',
  dataScope: 'document',
};

describe('keepsItemPaths', () => {
  const leaf = { op: 'setScalar' as const, path: P, keys: ['fit'], value: 'stretch' };
  it('keeps memory across edits inside items', () => {
    expect(
      keepsItemPaths({ ops: [leaf, { op: 'removeKey', path: P, keys: ['src'] }], source: 'batch' }),
    ).toBe(true);
  });
  it('ends it on any op that can move an item, even beside leaf edits', () => {
    const move = { op: 'moveItem' as const, path: 'sections.body.items', from: 1, to: 0 };
    expect(keepsItemPaths({ ops: [move], source: 'apply' })).toBe(false);
    expect(keepsItemPaths({ ops: [leaf, move], source: 'batch' })).toBe(false);
  });
  it('ends it on a history move, which carries no ops', () => {
    expect(keepsItemPaths({ ops: [], source: 'undo' })).toBe(false);
  });
});

describe('imageSourceMode', () => {
  it('follows hasData, so both keys read as bound', () => {
    expect(imageSourceMode({ hasData: false })).toBe('fixed');
    expect(imageSourceMode({ hasData: true })).toBe('data');
  });
});

describe('imageToDataOps', () => {
  it('drops a present src and seeds an empty key', () => {
    expect(imageToDataOps(P, { hasSrc: true }, null)).toEqual([
      { op: 'removeKey', path: P, keys: ['src'] },
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: '' },
    ]);
  });

  it('removes nothing when there is no src key', () => {
    expect(imageToDataOps(P, { hasSrc: false }, null)).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: '' },
    ]);
  });

  it('writes a remembered key before its scope', () => {
    expect(imageToDataOps(P, { hasSrc: false }, { key: 'a.b', scope: 'document' })).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'a.b' },
      { op: 'setScalar', path: P, keys: ['data', 'scope'], value: 'document' },
    ]);
  });

  it('writes no scope for a remembered binding that had none', () => {
    expect(imageToDataOps(P, { hasSrc: false }, { key: 'a.b', scope: '' })).toEqual([
      { op: 'setScalar', path: P, keys: ['data', 'key'], value: 'a.b' },
    ]);
  });
});

describe('imageToFixedOps', () => {
  it('drops the binding and writes the src', () => {
    expect(imageToFixedOps(P, 'x.svg')).toEqual([
      { op: 'removeKey', path: P, keys: ['data'] },
      { op: 'setScalar', path: P, keys: ['src'], value: 'x.svg' },
    ]);
  });
});

describe('planImageSwitch', () => {
  it('to data: applies the ops and remembers the dropped src', () => {
    const plan = planImageSwitch(P, fixed, 'data', null);
    expect(plan.kind).toBe('ops');
    expect(plan.memory).toEqual({ path: P, src: 'logo.svg' });
  });

  it('to data: remembers no src when the item had none to drop', () => {
    const plan = planImageSwitch(P, { ...fixed, hasSrc: false, src: '' }, 'data', null);
    expect(plan.memory).toEqual({ path: P });
  });

  it('to data: restores the binding this path dropped earlier', () => {
    const memory = { path: P, binding: { key: 'shop.logo', scope: '' } };
    const plan = planImageSwitch(P, fixed, 'data', memory);
    expect(plan.kind === 'ops' ? plan.ops[1] : null).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['data', 'key'],
      value: 'shop.logo',
    });
    // Both halves are kept: the src just dropped AND the binding.
    expect(plan.memory).toEqual({ ...memory, src: 'logo.svg' });
  });

  it('to fixed with nothing remembered asks for a pick, remembering the binding', () => {
    expect(planImageSwitch(P, bound, 'fixed', null)).toEqual({
      kind: 'pick',
      memory: { path: P, binding: { key: 'shop.logo', scope: 'document' } },
    });
  });

  it('to fixed with a remembered src restores it, keeping the src in memory', () => {
    const plan = planImageSwitch(P, bound, 'fixed', { path: P, src: 'logo.svg' });
    expect(plan).toEqual({
      kind: 'restore',
      src: 'logo.svg',
      memory: { path: P, src: 'logo.svg', binding: { key: 'shop.logo', scope: 'document' } },
    });
  });

  it('to fixed remembers no binding for an empty key', () => {
    const plan = planImageSwitch(P, { ...bound, dataKey: '' }, 'fixed', null);
    expect(plan.memory).toEqual({ path: P });
  });

  it('ignores memory kept for another path', () => {
    const other = { path: 'sections.body.items[9]', src: 'other.svg' };
    expect(planImageSwitch(P, bound, 'fixed', other).kind).toBe('pick');
  });

  it('to fixed over both keys drops data alone', () => {
    const plan = planImageSwitch(P, { ...bound, hasSrc: true, src: 'kept.svg' }, 'fixed', null);
    expect(plan.kind === 'ops' ? plan.ops : null).toEqual([
      { op: 'removeKey', path: P, keys: ['data'] },
    ]);
  });
});

describe('every plan leaves exactly one source', () => {
  const doc = (item: string) => `sections:\n  body:\n    type: flow\n    items:\n      - ${item}\n`;
  const sources = (editor: Editor) => {
    const node = editor.read(P) as Record<string, unknown>;
    return [Object.hasOwn(node, 'src'), Object.hasOwn(node, 'data')];
  };

  it.each([
    [
      'a fixed image to data',
      '{ type: image, box: { w: 9, h: 9 }, src: a.svg }',
      imageToDataOps(P, { hasSrc: true }, null),
      [false, true],
    ],
    [
      'a neither image to data',
      '{ type: image, box: { w: 9, h: 9 } }',
      imageToDataOps(P, { hasSrc: false }, { key: 'k', scope: 'document' }),
      [false, true],
    ],
    [
      'a bound image to fixed',
      '{ type: image, box: { w: 9, h: 9 }, data: { key: k } }',
      imageToFixedOps(P, 'a.svg'),
      [true, false],
    ],
  ])('%s', (_name, item, ops, expected) => {
    const editor = Editor.create(doc(item));
    expect(editor.applyAll(ops)).toEqual({ ok: true });
    expect(sources(editor)).toEqual(expected);
  });
});
