import { describe, expect, it } from 'vitest';
import {
  BAND_REPEATS,
  bandHeightOp,
  bandRepeatOp,
  DEFAULT_REPEAT,
  effectiveRepeat,
  isKnownRepeat,
  readBandView,
} from './bandModel';

const PATH = 'sections.footer';

describe('BAND_REPEATS', () => {
  it('mirrors the engine `Repeat` enum, in its declaration order', () => {
    // engine/core/src/template.rs — serde `rename_all = "snake_case"`, so
    // anything not spelled exactly like this is a parse error.
    expect(BAND_REPEATS).toEqual(['every_page', 'first_page', 'except_first_page', 'last_page']);
    expect(DEFAULT_REPEAT).toBe('every_page');
  });
});

describe('readBandView', () => {
  it('reads an authored band', () => {
    expect(readBandView({ repeat: 'last_page', height: 60, items: [] })).toEqual({
      repeat: 'last_page',
      height: '60',
    });
  });

  it('reads an unset band as two empty fields', () => {
    expect(readBandView({ items: [] })).toEqual({ repeat: '', height: '' });
  });

  it('degrades a non-map node rather than throwing', () => {
    for (const raw of [undefined, null, 3, 'footer', [1, 2]]) {
      expect(readBandView(raw)).toEqual({ repeat: '', height: '' });
    }
  });

  it('degrades wrong-typed values — the wire takes a string mode and a finite number', () => {
    expect(readBandView({ repeat: 7, height: 'tall' })).toEqual({ repeat: '', height: '' });
    expect(readBandView({ height: Number.POSITIVE_INFINITY })).toEqual({
      repeat: '',
      height: '',
    });
    expect(readBandView({ height: Number.NaN })).toEqual({ repeat: '', height: '' });
  });

  it('reports an UNKNOWN authored mode verbatim instead of hiding it', () => {
    expect(readBandView({ repeat: 'odd_pages' }).repeat).toBe('odd_pages');
  });

  it('reads an inherited property as unset (a hostile prototype cannot fill a field)', () => {
    const hostile = Object.create({ repeat: 'last_page', height: 99 }) as Record<string, unknown>;
    expect(readBandView(hostile)).toEqual({ repeat: '', height: '' });
  });
});

describe('effectiveRepeat / isKnownRepeat', () => {
  it('an absent key means the engine default', () => {
    expect(effectiveRepeat('')).toBe('every_page');
    expect(effectiveRepeat('last_page')).toBe('last_page');
  });

  it('recognizes exactly the four wire modes', () => {
    for (const mode of BAND_REPEATS) {
      expect(isKnownRepeat(mode)).toBe(true);
    }
    expect(isKnownRepeat('EveryPage')).toBe(false);
    expect(isKnownRepeat('')).toBe(false);
    expect(isKnownRepeat('__proto__')).toBe(false);
  });
});

describe('bandRepeatOp', () => {
  it('authors the picked mode', () => {
    expect(bandRepeatOp(PATH, 'every_page', 'last_page')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['repeat'],
      value: 'last_page',
    });
  });

  it('authors every one of the four modes', () => {
    for (const mode of BAND_REPEATS) {
      const op = bandRepeatOp(PATH, mode === 'first_page' ? 'last_page' : 'first_page', mode);
      expect(op).toEqual({ op: 'setScalar', path: PATH, keys: ['repeat'], value: mode });
    }
  });

  it('authors NOTHING when the pick is the mode already on screen', () => {
    expect(bandRepeatOp(PATH, 'last_page', 'last_page')).toBeNull();
  });

  it('authors NOTHING when the pick is the IMPLICIT default of an unset band', () => {
    // The select shows `every_page` for a band with no `repeat:` key, so
    // picking it changes nothing the reader can see — and must mint no undo step.
    expect(bandRepeatOp(PATH, '', 'every_page')).toBeNull();
  });

  it('refuses a mode the engine does not have', () => {
    expect(bandRepeatOp(PATH, 'every_page', 'odd_pages')).toBeNull();
    expect(bandRepeatOp(PATH, 'every_page', '__proto__')).toBeNull();
    expect(bandRepeatOp(PATH, 'every_page', '')).toBeNull();
  });
});

describe('bandHeightOp', () => {
  it('authors a number — the wire takes no unit strings', () => {
    expect(bandHeightOp(PATH, '48')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['height'],
      value: 48,
    });
  });

  it('clears the key on an empty entry', () => {
    expect(bandHeightOp(PATH, '  ')).toEqual({ op: 'removeKey', path: PATH, keys: ['height'] });
  });

  it('dispatches nothing for an unparseable entry', () => {
    expect(bandHeightOp(PATH, 'tall')).toBeNull();
    expect(bandHeightOp(PATH, 'Infinity')).toBeNull();
  });
});
