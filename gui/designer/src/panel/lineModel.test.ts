import { describe, expect, it } from 'vitest';
import { type BorderStyleValue, MAX_STROKE_WIDTH } from './borderTypes';
import { lineStyleOps, readLineStyle } from './lineModel';

const KNOWN: readonly BorderStyleValue[] = ['solid', 'double', 'dashed', 'dotted'];
const PATH = 'sections.body.items[0]';

const read = (item: unknown) => () => item;

describe('readLineStyle', () => {
  it('reports an unstyled line as unset width/colour and a solid stroke', () => {
    const view = readLineStyle(read({ type: 'line' }), PATH, KNOWN);
    expect(view).toEqual({ width: '', color: '', style: 'solid' });
  });

  it('reads the authored stroke', () => {
    const view = readLineStyle(
      read({ style: { width: 0.8, color: '#adb5bd', style: 'dashed' } }),
      PATH,
      KNOWN,
    );
    expect(view).toEqual({ width: '0.8', color: '#adb5bd', style: 'dashed' });
  });

  it('degrades hostile in-memory values instead of surfacing them', () => {
    // A keyword the engine would reject must never reach the picker, and a
    // non-numeric width must not become a string in a number field.
    const view = readLineStyle(
      read({ style: { width: 'wide', color: 42, style: 'zigzag' } }),
      PATH,
      KNOWN,
    );
    expect(view).toEqual({ width: '', color: '', style: 'solid' });
    expect(readLineStyle(read({ style: { width: -3 } }), PATH, KNOWN).width).toBe('');
    expect(readLineStyle(read({ style: { width: Number.NaN } }), PATH, KNOWN).width).toBe('');
    expect(readLineStyle(read({ style: [1, 2] }), PATH, KNOWN).style).toBe('solid');
  });

  it('reads a throwing document as an unstyled line', () => {
    const throwing = () => {
      throw new Error('alias bomb');
    };
    expect(readLineStyle(throwing, PATH, KNOWN)).toEqual({
      width: '',
      color: '',
      style: 'solid',
    });
  });
});

describe('lineStyleOps', () => {
  const solid = readLineStyle(read({ type: 'line' }), PATH, KNOWN);
  const dashed = readLineStyle(read({ style: { style: 'dashed', color: '#111111' } }), PATH, KNOWN);

  it('authors a patterned keyword and removes it again for solid', () => {
    expect(lineStyleOps(PATH, solid, { style: 'dashed' })).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'style'], value: 'dashed' },
    ]);
    // `solid` is the engine default — removing beats authoring it.
    expect(lineStyleOps(PATH, dashed, { style: 'solid' })).toEqual([
      { op: 'removeKey', path: PATH, keys: ['style', 'style'] },
    ]);
  });

  it('writes nothing when the picked value is already the effective one', () => {
    expect(lineStyleOps(PATH, dashed, { style: 'dashed' })).toEqual([]);
    expect(lineStyleOps(PATH, dashed, { color: '#111111' })).toEqual([]);
    expect(lineStyleOps(PATH, solid, { width: '' })).toEqual([]);
  });

  it('authors and clears the colour', () => {
    expect(lineStyleOps(PATH, solid, { color: '#ff0000' })).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'color'], value: '#ff0000' },
    ]);
    expect(lineStyleOps(PATH, dashed, { color: '' })).toEqual([
      { op: 'removeKey', path: PATH, keys: ['style', 'color'] },
    ]);
  });

  it('authors a numeric width, clears an emptied one, and refuses garbage', () => {
    expect(lineStyleOps(PATH, solid, { width: ' 0.8 ' })).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'width'], value: 0.8 },
    ]);
    const wide = readLineStyle(read({ style: { width: 2 } }), PATH, KNOWN);
    expect(lineStyleOps(PATH, wide, { width: '' })).toEqual([
      { op: 'removeKey', path: PATH, keys: ['style', 'width'] },
    ]);
    // The engine takes a bare pt number here, so a unit string or a negative
    // is refused rather than written and warned about later.
    expect(lineStyleOps(PATH, solid, { width: '2mm' })).toEqual([]);
    expect(lineStyleOps(PATH, solid, { width: '-1' })).toEqual([]);
  });

  it('clamps an over-cap width instead of authoring what the engine would warn on', () => {
    // The engine caps a line stroke at 0..=1000pt (`invalid_line_width`) and
    // falls back to 1pt; the pen writes the cap so the file never carries the
    // out-of-range value. Same rule the border pen applies.
    expect(lineStyleOps(PATH, solid, { width: '1e300' })).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'width'], value: MAX_STROKE_WIDTH },
    ]);
    expect(lineStyleOps(PATH, solid, { width: '1000' })).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'width'], value: MAX_STROKE_WIDTH },
    ]);
  });

  it('is a no-op when the edit names no property', () => {
    expect(lineStyleOps(PATH, solid, {})).toEqual([]);
  });
});
