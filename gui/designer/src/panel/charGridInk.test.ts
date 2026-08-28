import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KINSOKU,
  kinsokuOp,
  MAX_RULING_WIDTH_PT,
  readCharGridInk,
  rubySizeOp,
  rulingColorOp,
  rulingWidthAcceptable,
  rulingWidthOp,
} from './charGridInk';

const PATH = 'sections.body.items[0]';

/** A `read` over a fixed document shape. */
function reader(item: unknown, styles: unknown = {}) {
  return (path: string) => (path === PATH ? item : path === 'styles' ? styles : undefined);
}

describe('readCharGridInk', () => {
  it('reads the item’s own ruling width and colour', () => {
    const view = readCharGridInk(
      reader({ style: { borderWidth: 1.5, borderColor: '#b91c1c' } }),
      PATH,
    );
    expect(view.rulingWidth).toBe('1.5');
    expect(view.rulingColor).toBe('#b91c1c');
    expect(view.widthFromStyle).toBeNull();
  });

  it('reads a per-side MAP as its TOP side, the way the engine does', () => {
    // `bw.uniform().unwrap_or_else(|| bw.sides()[0])` — the other three sides
    // cannot take effect on a grid. The generic cascade flattens a map to unset,
    // which would report a set ruling as blank; that is why this reads directly.
    const view = readCharGridInk(
      reader({ style: { borderWidth: { top: 2, bottom: 9 }, borderColor: { top: '#15803d' } } }),
      PATH,
    );
    expect(view.rulingWidth).toBe('2');
    expect(view.rulingColor).toBe('#15803d');
  });

  it('falls back to a named style, and says which one', () => {
    const view = readCharGridInk(
      reader({ styleNames: ['grid'] }, { grid: { borderWidth: 0.25 } }),
      PATH,
    );
    expect(view.rulingWidth).toBe('0.25');
    expect(view.widthFromStyle).toBe('grid');
  });

  it('lets the item’s OWN value win, and then names no style', () => {
    // The engine's `authored()` ends `pick(&item.style).or(found)` — own beats
    // every name. Naming the style here would point at a value being overridden.
    const view = readCharGridInk(
      reader({ styleNames: ['grid'], style: { borderWidth: 3 } }, { grid: { borderWidth: 0.25 } }),
      PATH,
    );
    expect(view.rulingWidth).toBe('3');
    expect(view.widthFromStyle).toBeNull();
  });

  it('takes the LATER of two named styles, as the engine does', () => {
    const view = readCharGridInk(
      reader({ styleNames: ['a', 'b'] }, { a: { borderWidth: 1 }, b: { borderWidth: 2 } }),
      PATH,
    );
    expect(view.rulingWidth).toBe('2');
    expect(view.widthFromStyle).toBe('b');
  });

  it('reports the EFFECTIVE kinsoku, so the control never shows an empty choice', () => {
    expect(readCharGridInk(reader({}), PATH).kinsoku).toBe(DEFAULT_KINSOKU);
    expect(readCharGridInk(reader({ kinsoku: 'none' }), PATH).kinsoku).toBe('none');
  });

  it('does not echo an unknown kinsoku back as if it were selected', () => {
    // Showing a garbage value as chosen would misreport what the engine does.
    expect(readCharGridInk(reader({ kinsoku: 'lenient' }), PATH).kinsoku).toBe(DEFAULT_KINSOKU);
  });

  it('degrades a hostile or absent node to unset rather than throwing', () => {
    const boom = () => {
      throw new Error('read failed');
    };
    for (const read of [boom, reader(undefined), reader('a string'), reader({ style: 'nope' })]) {
      const view = readCharGridInk(read as never, PATH);
      expect(view.rulingWidth).toBe('');
      expect(view.rulingColor).toBe('');
      expect(view.kinsoku).toBe(DEFAULT_KINSOKU);
    }
  });

  it('does not resolve a prototype style NAME to an inherited value', () => {
    // `styleNames` entries are document strings.
    const view = readCharGridInk(reader({ styleNames: ['constructor', '__proto__'] }, {}), PATH);
    expect(view.rulingWidth).toBe('');
    expect(view.widthFromStyle).toBeNull();
  });
});

describe('rulingWidthOp', () => {
  it('CLEARS on empty, which returns the ruling to the engine’s 0.5pt default', () => {
    // The plan first said empty must reseed. Its own reason — that unset means
    // 0.5pt — is the argument for clearing: an absent key IS the default, so
    // there has to be a way back to it that is not authoring `0.5` by hand.
    expect(rulingWidthOp(PATH, '')).toEqual({
      op: 'removeKey',
      path: PATH,
      keys: ['style', 'borderWidth'],
    });
  });

  it('authors 0, because "no ruling" is a value and not a separate control', () => {
    // `push_grid_rects` returns early on `width <= 0.0`. This is the whole of D2.
    expect(rulingWidthOp(PATH, '0')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'borderWidth'],
      value: 0,
    });
  });

  it('authors an ordinary width', () => {
    expect(rulingWidthOp(PATH, '1.5')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'borderWidth'],
      value: 1.5,
    });
  });

  it('REFUSES a width the engine would not honour, rather than authoring one it ignores', () => {
    // Outside `0.0..=MAX_STROKE_WIDTH_PT` the engine emits `invalid_border_width`
    // and falls back, so accepting it would show a width the document does not use.
    for (const bad of ['-1', String(MAX_RULING_WIDTH_PT + 1), 'wide', 'Infinity', 'NaN']) {
      expect(rulingWidthOp(PATH, bad), bad).toBeNull();
    }
  });

  it('accepts both ends of the engine’s range', () => {
    expect(rulingWidthAcceptable('0')).toBe(true);
    expect(rulingWidthAcceptable(String(MAX_RULING_WIDTH_PT))).toBe(true);
    expect(rulingWidthAcceptable(String(MAX_RULING_WIDTH_PT + 0.01))).toBe(false);
  });
});

describe('the other ink ops', () => {
  it('clears the ruling colour on empty', () => {
    expect(rulingColorOp(PATH, '')).toEqual({
      op: 'removeKey',
      path: PATH,
      keys: ['style', 'borderColor'],
    });
  });

  it('authors a picked ruling colour as a scalar', () => {
    expect(rulingColorOp(PATH, '#1d4ed8')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['style', 'borderColor'],
      value: '#1d4ed8',
    });
  });

  it('never authors the kinsoku DEFAULT — picking it removes the key', () => {
    expect(kinsokuOp(PATH, 'school')).toEqual({ op: 'removeKey', path: PATH, keys: ['kinsoku'] });
    expect(kinsokuOp(PATH, 'none')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['kinsoku'],
      value: 'none',
    });
  });

  it('clears the ruby size on empty, back to 0.4 × the cell', () => {
    expect(rubySizeOp(PATH, '')).toEqual({ op: 'removeKey', path: PATH, keys: ['rubySize'] });
    expect(rubySizeOp(PATH, '6')).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['rubySize'],
      value: 6,
    });
  });
});
