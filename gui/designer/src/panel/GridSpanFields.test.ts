import { describe, expect, it } from 'vitest';
import { spanOp } from './GridSpanFields';

const PATH = 'sections.body.items[0].items[1]';

describe('spanOp', () => {
  it('authors a span above 1, clamped to the ceiling', () => {
    expect(spanOp(PATH, 'columnSpan', '2', 3, undefined)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columnSpan'],
      value: 2,
    });
    expect(spanOp(PATH, 'rowSpan', ' 99 ', 64, undefined)).toMatchObject({ value: 64 });
  });

  it('removes a present key for 1 or an emptied field, and authors nothing when absent', () => {
    const remove = { op: 'removeKey', path: PATH, keys: ['box', 'columnSpan'] };
    expect(spanOp(PATH, 'columnSpan', '1', 3, 2)).toEqual(remove);
    expect(spanOp(PATH, 'columnSpan', '', 3, 2)).toEqual(remove);
    expect(spanOp(PATH, 'columnSpan', '1', 3, undefined)).toBeNull();
  });

  it('clamps BEFORE the 1-rule: at a ceiling of 1 a step up authors nothing, never `1`', () => {
    expect(spanOp(PATH, 'columnSpan', '2', 1, undefined)).toBeNull();
    expect(spanOp(PATH, 'columnSpan', '5', 1, 3)).toEqual({
      op: 'removeKey',
      path: PATH,
      keys: ['box', 'columnSpan'],
    });
  });

  it('authors nothing when the clamped value is already authored', () => {
    expect(spanOp(PATH, 'columnSpan', '4', 3, 3)).toBeNull();
  });

  it('refuses anything that is not a whole number of at least 1', () => {
    for (const bad of ['0', '-2', '1.5', 'x', 'Infinity']) {
      expect(spanOp(PATH, 'rowSpan', bad, 64, 2)).toBeNull();
    }
  });
});
