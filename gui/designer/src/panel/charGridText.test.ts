import { describe, expect, it } from 'vitest';
import {
  charGridCombineHint,
  charGridContextFor,
  charGridVertical,
  ownLayersContext,
} from './charGridText';
import { verticalOptionLabel } from './styleLabels';

const ctx = {
  item: { style: { fontWeight: 'bold' } },
  registry: {},
  defaults: { textAlign: 'center', fontSize: '14' },
  ancestors: [{ style: { textAlign: 'right' } }],
  floor: { textAlign: 'left', fontSize: '10', fontWeight: 'normal' },
};

describe('a char_grid’s own-layer reads', () => {
  it('drops the ancestors, the document defaults and the floor', () => {
    expect(ownLayersContext(ctx)).toEqual({ ...ctx, ancestors: [], defaults: {}, floor: {} });
  });

  it('routes only the size and the alignment through the own layers', () => {
    const contextFor = charGridContextFor(ctx);
    expect(contextFor('fontSize').ancestors).toEqual([]);
    expect(contextFor('textAlign').defaults).toEqual({});
    expect(contextFor('fontWeight')).toBe(ctx);
  });

  it('reads the direction from the item’s own writingMode field', () => {
    expect(charGridVertical(() => ({ writingMode: 'vertical_rl' }), 'p')).toBe(true);
    expect(charGridVertical(() => ({ style: { writingMode: 'vertical_rl' } }), 'p')).toBe(false);
  });
});

describe('a vertical line’s option names', () => {
  const t = (key: string) => key;
  it('names textAlign by the line’s start and end, and every other field as usual', () => {
    expect(verticalOptionLabel(t, 'textAlign', 'left')).toBe('style.value.textAlign.vertical.left');
    expect(verticalOptionLabel(t, 'textAlign', 'right')).toBe(
      'style.value.textAlign.vertical.right',
    );
    expect(verticalOptionLabel(t, 'textAlign', 'justify')).toBe('justify');
    expect(verticalOptionLabel(t, 'fontWeight', 'bold')).toBe('style.value.fontWeight.bold');
  });
});

describe('a char_grid’s tate-chu-yoko hint', () => {
  const inherited = {
    value: 'all',
    cascade: 'all',
    own: '',
    origin: 'inherited',
    styleName: '',
  } as const;
  it('drops an inherited `all`, which the grid combines nothing for', () => {
    expect(charGridCombineHint(inherited).origin).toBe('unset');
    expect(charGridCombineHint(inherited).value).toBe('');
  });
  it('keeps a digit run, and the grid’s own value', () => {
    const digits = { ...inherited, value: 'digits2', cascade: 'digits2' };
    expect(charGridCombineHint(digits)).toBe(digits);
    const own = { ...inherited, own: 'all', origin: 'own' } as const;
    expect(charGridCombineHint(own)).toBe(own);
  });
});
