import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  MAX_TRACK_PT,
  readTracks,
  trackCount,
  trackEntry,
  trackFormOp,
  trackKindOps,
  trackListResizeOps,
  trackValueOps,
} from './gridTracks';

const PATH = 'sections.body.items[0]';
const SEQ = `${PATH}.box.columns`;

describe('readTracks', () => {
  it('reads absent, a count and a list', () => {
    expect(readTracks(undefined)).toEqual({ form: 'unset' });
    expect(readTracks(3)).toEqual({ form: 'count', count: 3 });
    expect(readTracks(2.7)).toEqual({ form: 'count', count: 2 });
    expect(readTracks(500)).toEqual({ form: 'count', count: 64 });
  });

  it('classifies every list entry, keeping unknown text verbatim as a fixed width', () => {
    expect(
      readTracks([90, '30mm', '25%', 'auto', ' auto ', '2fr', '1.5 fr', 'garbage', { x: 1 }, null]),
    ).toEqual({
      form: 'list',
      tracks: [
        { kind: 'fixed', value: '90' },
        { kind: 'fixed', value: '30mm' },
        { kind: 'fixed', value: '25%' },
        { kind: 'auto', value: '' },
        { kind: 'auto', value: '' },
        { kind: 'fr', value: '2' },
        { kind: 'fr', value: '1.5' },
        { kind: 'fixed', value: 'garbage' },
        { kind: 'fixed', value: '' },
        { kind: 'fixed', value: '' },
      ],
    });
  });

  it('caps a long list at the engine track limit', () => {
    const spec = readTracks(Array.from({ length: 70 }, () => 'auto'));
    expect(spec?.form === 'list' ? spec.tracks.length : 0).toBe(64);
  });

  it('gives no editor to an unreadable value', () => {
    expect(readTracks(0)).toBeNull();
    expect(readTracks(Number.NaN)).toBeNull();
    expect(readTracks([])).toBeNull();
    expect(readTracks('x')).toBeNull();
    expect(readTracks({})).toBeNull();
  });

  it('counts the tracks of each form', () => {
    expect(trackCount({ form: 'unset' })).toBe(1);
    expect(trackCount({ form: 'count', count: 4 })).toBe(4);
    expect(trackCount({ form: 'list', tracks: [{ kind: 'auto', value: '' }] })).toBe(1);
  });
});

describe('trackFormOp', () => {
  it('writes a count, a list of equal shares (columns) or content rows, or no key', () => {
    expect(trackFormOp(PATH, 'columns', 'count', 3)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columns'],
      value: 3,
    });
    expect(trackFormOp(PATH, 'columns', 'list', 2)).toEqual({
      op: 'putValue',
      path: PATH,
      keys: ['box', 'columns'],
      value: ['1fr', '1fr'],
    });
    expect(trackFormOp(PATH, 'rows', 'list', 2)).toMatchObject({ value: ['auto', 'auto'] });
    expect(trackFormOp(PATH, 'rows', 'unset', 2)).toEqual({
      op: 'removeKey',
      path: PATH,
      keys: ['box', 'rows'],
    });
  });

  it('clamps the track count to 1..64', () => {
    expect(trackFormOp(PATH, 'columns', 'count', 0)).toMatchObject({ value: 1 });
    expect(trackFormOp(PATH, 'columns', 'count', 99)).toMatchObject({ value: 64 });
  });
});

describe('trackEntry (the typed value → a wire entry, or refused)', () => {
  it('reads an fr share as a finite weight in [0, 1000]', () => {
    expect(trackEntry('fr', '2')).toBe('2fr');
    expect(trackEntry('fr', ' 0.5 ')).toBe('0.5fr');
    expect(trackEntry('fr', '0')).toBe('0fr');
    for (const bad of ['', '-1', 'x', 'Infinity', '1001']) {
      expect(trackEntry('fr', bad)).toBeNull();
    }
  });

  it('reads a fixed width as a non-negative length within the cap, % and em included', () => {
    expect(trackEntry('fixed', '90')).toBe(90);
    expect(trackEntry('fixed', '30mm')).toBe('30mm');
    expect(trackEntry('fixed', '25%')).toBe('25%');
    expect(trackEntry('fixed', '2em')).toBe('2em');
    expect(trackEntry('fixed', String(MAX_TRACK_PT))).toBe(MAX_TRACK_PT);
    for (const bad of ['', '-5', '-5%', 'wide', String(MAX_TRACK_PT + 1), '1fr']) {
      expect(trackEntry('fixed', bad)).toBeNull();
    }
  });

  it('never types a value into a fit-the-content track', () => {
    expect(trackEntry('auto', '5')).toBeNull();
  });
});

describe('entry edits replace ONE entry in place', () => {
  it('a kind change is remove + insert of that kind default at the same index', () => {
    expect(trackKindOps(PATH, 'columns', 1, 'fixed')).toEqual([
      { op: 'removeItem', path: SEQ, index: 1 },
      { op: 'insertItem', path: SEQ, index: 1, value: 100 },
    ]);
    expect(trackKindOps(PATH, 'rows', 0, 'fr')[1]).toMatchObject({ value: '1fr' });
    expect(trackKindOps(PATH, 'rows', 0, 'auto')[1]).toMatchObject({ value: 'auto' });
  });

  it('a value commit replaces the entry, or is refused whole', () => {
    expect(trackValueOps(PATH, 'columns', 0, 'fr', '3')).toEqual([
      { op: 'removeItem', path: SEQ, index: 0 },
      { op: 'insertItem', path: SEQ, index: 0, value: '3fr' },
    ]);
    expect(trackValueOps(PATH, 'columns', 0, 'fixed', '-1')).toBeNull();
  });

  it('keeps every other entry and its comment byte-for-byte (real document)', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        box:',
      '          type: grid',
      '          columns:',
      '            - 90 # the label column',
      '            - 1fr',
      '            - auto # the amount',
      '        items: []',
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const ops = trackValueOps(PATH, 'columns', 1, 'fr', '2');
    expect(editor.applyAll(ops ?? []).ok).toBe(true);
    expect(editor.read(SEQ)).toEqual([90, '2fr', 'auto']);
    const text = editor.text();
    expect(text).toContain('- 90 # the label column');
    expect(text).toContain('- auto # the amount');
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe(source);
  });
});

describe('trackListResizeOps', () => {
  it('appends copies of the last entry, or drops trailing ones', () => {
    expect(trackListResizeOps(PATH, 'columns', [90, '2fr'], 4)).toEqual([
      { op: 'insertItem', path: SEQ, index: 2, value: '2fr' },
      { op: 'insertItem', path: SEQ, index: 3, value: '2fr' },
    ]);
    expect(trackListResizeOps(PATH, 'rows', [1, 2, 3], 1)).toEqual([
      { op: 'removeItem', path: `${PATH}.box.rows`, index: 2 },
      { op: 'removeItem', path: `${PATH}.box.rows`, index: 1 },
    ]);
    expect(trackListResizeOps(PATH, 'rows', [1], 1)).toEqual([]);
  });
});
