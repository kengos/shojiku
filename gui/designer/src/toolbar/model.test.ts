import { describe, expect, it } from 'vitest';
import { readItemView } from '../panel/itemView';
import { type EffectiveStyles, type EffectiveValue, TOOLBAR_STYLE_KEYS } from './effective';
import {
  ALIGN_VALUES,
  alignedValue,
  alignOp,
  BOLD_VALUE,
  colorOp,
  fontFamilyOp,
  fontSizeOp,
  fontStyleOp,
  fontWeightOp,
  formatContext,
  ITALIC_VALUE,
  readToolbar,
  styleEnumOptions,
} from './model';

const P = 'sections.body.items[0]';

/** One effective value, defaulting to fully unset. */
function ev(over: Partial<EffectiveValue> = {}): EffectiveValue {
  return { value: '', cascade: '', own: '', origin: 'unset', styleName: '', ...over };
}

/** A full effective-styles record with per-key overrides. */
function effOf(
  over: Partial<Record<(typeof TOOLBAR_STYLE_KEYS)[number], EffectiveValue>> = {},
): EffectiveStyles {
  const out = {} as Record<(typeof TOOLBAR_STYLE_KEYS)[number], EffectiveValue>;
  for (const key of TOOLBAR_STYLE_KEYS) {
    out[key] = over[key] ?? ev();
  }
  return out;
}

/** An own-authored value (own layer wins, no cascade beneath). */
function own(value: string): EffectiveValue {
  return ev({ value, own: value, origin: 'own' });
}

describe('readToolbar applicability', () => {
  it('gives a text item the full typography + text-color set', () => {
    const model = readToolbar(readItemView({ type: 'text', text: 'x' }), effOf());
    expect(model).not.toBeNull();
    expect(model?.typography).toBe(true);
    expect(model?.colorKey).toBe('color');
  });

  it('gives a rect only the fill color (no typography)', () => {
    const model = readToolbar(readItemView({ type: 'rect' }), effOf());
    expect(model?.typography).toBe(false);
    expect(model?.colorKey).toBe('backgroundColor');
  });

  it('gives a qr_code the fill color (no typography), so its border shows', () => {
    const model = readToolbar(readItemView({ type: 'qr_code' }), effOf());
    expect(model?.typography).toBe(false);
    expect(model?.colorKey).toBe('backgroundColor');
  });

  it('gives a table and a container the fill color (no typography)', () => {
    for (const type of ['table', 'container', 'image']) {
      const model = readToolbar(readItemView({ type }), effOf());
      expect(model, type).not.toBeNull();
      expect(model?.typography, type).toBe(false);
      expect(model?.colorKey, type).toBe('backgroundColor');
    }
  });

  it('offers nothing for a non-boxed item (line), no view (null), or a ghost node', () => {
    expect(readToolbar(readItemView({ type: 'line' }), effOf())).toBeNull();
    expect(readToolbar(null, effOf())).toBeNull();
    // A non-map node materializes to no item view — the toolbar shows nothing.
    expect(readToolbar(readItemView('not a map'), effOf())).toBeNull();
  });

  it('reflects the EFFECTIVE values, wherever they come from', () => {
    const eff = effOf({
      fontFamily: ev({
        value: 'noto-sans',
        cascade: 'noto-sans',
        origin: 'style',
        styleName: 'heading',
      }),
      fontSize: own('14'),
      fontWeight: ev({ value: 'bold', cascade: 'bold', origin: 'style', styleName: 'heading' }),
      fontStyle: own('italic'),
      textAlign: ev({ value: 'center', cascade: 'center', origin: 'default' }),
      color: own('#112233'),
    });
    const model = readToolbar(
      readItemView({ type: 'text', text: 'x', styleNames: ['heading'] }),
      eff,
    );
    expect(model).toMatchObject({
      bold: true,
      italic: true,
      align: 'center',
      color: '#112233',
      styleNames: ['heading'],
    });
    expect(model?.eff.fontFamily.value).toBe('noto-sans');
    expect(model?.eff.fontSize.value).toBe('14');
  });

  it('reports bold/italic false and no alignment when nothing resolves', () => {
    const model = readToolbar(readItemView({ type: 'text', text: 'x' }), effOf());
    expect(model?.bold).toBe(false);
    expect(model?.italic).toBe(false);
    expect(model?.align).toBe('');
  });

  it('reads a rect fill off the effective backgroundColor', () => {
    const model = readToolbar(
      readItemView({ type: 'rect' }),
      effOf({ backgroundColor: own('#abcdef') }),
    );
    expect(model?.color).toBe('#abcdef');
  });
});

describe('alignedValue', () => {
  it('normalizes unset to the engine default left', () => {
    expect(alignedValue('')).toBe('left');
    expect(alignedValue('right')).toBe('right');
  });
});

describe('toggle ops author the minimal wire over the cascade', () => {
  it('authors bold when the cascade does not give it', () => {
    expect(fontWeightOp(P, ev(), true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontWeight'],
      value: 'bold',
    });
  });

  it('removes an own bold when unpressing (cascade default is normal)', () => {
    expect(fontWeightOp(P, own('bold'), false)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'fontWeight'],
    });
  });

  it('authors normal ONLY as a cascade override (style-driven bold, unpress)', () => {
    const styleBold = ev({ value: 'bold', cascade: 'bold', origin: 'style', styleName: 'title' });
    expect(fontWeightOp(P, styleBold, false)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontWeight'],
      value: 'normal',
    });
  });

  it('drops the own key instead of restating a cascade bold', () => {
    // Own `bold` over a style that ALSO sets bold: pressing on again after an
    // off (or toggling to the cascade value) just removes the redundancy.
    const redundant = ev({ value: 'bold', cascade: 'bold', own: 'bold', origin: 'own' });
    expect(fontWeightOp(P, redundant, true)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'fontWeight'],
    });
  });

  it('does nothing when the cascade already matches and no own key exists', () => {
    expect(fontWeightOp(P, ev(), false)).toBeNull();
    const styleBold = ev({ value: 'bold', cascade: 'bold', origin: 'style' });
    expect(fontWeightOp(P, styleBold, true)).toBeNull();
  });

  it('toggles fontStyle with the same rules', () => {
    expect(fontStyleOp(P, ev(), true)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontStyle'],
      value: 'italic',
    });
    const styleItalic = ev({ value: 'italic', cascade: 'italic', origin: 'style' });
    expect(fontStyleOp(P, styleItalic, false)).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontStyle'],
      value: 'normal',
    });
    expect(fontStyleOp(P, own('italic'), false)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'fontStyle'],
    });
    expect(fontStyleOp(P, ev(), false)).toBeNull();
  });
});

describe('align ops', () => {
  it('authors the clicked alignment when the cascade does not give it', () => {
    expect(alignOp(P, ev(), 'center')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'textAlign'],
      value: 'center',
    });
  });

  it('clicking the active own alignment reverts to the cascade', () => {
    expect(alignOp(P, own('center'), 'center')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'textAlign'],
    });
  });

  it('drops the own key when the clicked value IS the cascade value', () => {
    const eff = ev({ value: 'right', cascade: 'center', own: 'right', origin: 'own' });
    expect(alignOp(P, eff, 'center')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'textAlign'],
    });
  });

  it('never authors left over an unset cascade (the engine default)', () => {
    expect(alignOp(P, own('right'), 'left')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'textAlign'],
    });
  });

  it('does nothing when clicking the effective cascade alignment with no own key', () => {
    const styleCenter = ev({ value: 'center', cascade: 'center', origin: 'style' });
    expect(alignOp(P, styleCenter, 'center')).toBeNull();
    expect(alignOp(P, ev(), 'left')).toBeNull();
  });
});

describe('combo commit ops', () => {
  it('sets fontFamily and clears the own key back to the cascade', () => {
    expect(fontFamilyOp(P, ev(), 'noto-sans')).toMatchObject({
      op: 'setScalar',
      value: 'noto-sans',
    });
    expect(fontFamilyOp(P, own('noto-sans'), '')).toMatchObject({
      op: 'removeKey',
      keys: ['style', 'fontFamily'],
    });
  });

  it('does nothing when clearing a combo that has no own key', () => {
    const inherited = ev({ value: 'serif', cascade: 'serif', origin: 'inherited' });
    expect(fontFamilyOp(P, inherited, '')).toBeNull();
    expect(fontSizeOp(P, ev(), '  ')).toBeNull();
    expect(colorOp(P, 'color', ev(), '')).toBeNull();
  });

  it('sets or clears a color at the given key', () => {
    expect(colorOp(P, 'color', ev(), '#ff0000')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'color'],
      value: '#ff0000',
    });
    expect(colorOp(P, 'backgroundColor', own('#abcdef'), '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'backgroundColor'],
    });
  });

  it('authors fontSize as a number, a unit string, or a key clear (via lengthOp)', () => {
    expect(fontSizeOp(P, ev(), '12')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontSize'],
      value: 12,
    });
    expect(fontSizeOp(P, ev(), '8mm')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['style', 'fontSize'],
      value: '8mm',
    });
    expect(fontSizeOp(P, own('12'), '')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['style', 'fontSize'],
    });
  });
});

describe('enum values stay pinned to the engine wire', () => {
  it('mirrors the STYLE_FIELDS textAlign options', () => {
    expect([...ALIGN_VALUES]).toEqual(styleEnumOptions('textAlign'));
  });

  it('uses the STYLE_FIELDS fontWeight/fontStyle non-default option', () => {
    expect(styleEnumOptions('fontWeight')).toContain(BOLD_VALUE);
    expect(styleEnumOptions('fontStyle')).toContain(ITALIC_VALUE);
  });

  it('returns no options for an unknown style key', () => {
    expect(styleEnumOptions('nope')).toEqual([]);
  });
});

describe('formatContext', () => {
  /** A `read` over one item at `P` plus a `styles` registry, the two document
   * nodes the context derives from. */
  function readOf(item: unknown, styles: unknown = {}) {
    return (path: string): unknown => (path === 'styles' ? styles : path === P ? item : undefined);
  }

  function ctxOf(item: unknown, styles: unknown = {}, capabilities?: readonly string[]) {
    const view = readItemView(item);
    if (view === null) {
      throw new Error('fixture item must be a readable view');
    }
    return formatContext({ read: readOf(item, styles), path: P, view, raw: item, capabilities });
  }

  it('captures the item OWN inline style props and offers capture for them', () => {
    const ctx = ctxOf({ type: 'text', text: 'x', style: { color: '#111', fontSize: 12 } });
    expect(ctx.captured).toEqual({ color: '#111', fontSize: 12 });
    expect(ctx.canCapture).toBe(true);
  });

  it('offers no capture when the item authors no inline style', () => {
    const ctx = ctxOf({ type: 'text', text: 'x' });
    expect(ctx.captured).toEqual({});
    expect(ctx.canCapture).toBe(false);
  });

  it('reads the registry names and unions them with the item own names', () => {
    const ctx = ctxOf(
      { type: 'text', text: 'x', styleNames: ['heading'] },
      { heading: {}, body: {} },
    );
    expect(ctx.registry).toEqual(['heading', 'body']);
    expect(ctx.styleOptions).toEqual(['heading', 'body']);
  });

  it('keeps an item-only style name in the options (a dangling name stays pickable)', () => {
    const ctx = ctxOf({ type: 'text', text: 'x', styleNames: ['ghost'] }, { body: {} });
    expect(ctx.styleOptions).toEqual(['body', 'ghost']);
    expect(ctx.updateTarget).toBeNull();
  });

  it('names the applied REGISTERED style as the update target', () => {
    const ctx = ctxOf({ type: 'text', text: 'x', styleNames: ['heading'] }, { heading: {} });
    expect(ctx.updateTarget).toBe('heading');
  });

  it('shows the picker when there is a style to toggle, even with nothing capturable', () => {
    const ctx = ctxOf({ type: 'text', text: 'x' }, { body: {} });
    expect(ctx.canCapture).toBe(false);
    expect(ctx.showStyles).toBe(true);
  });

  it('shows the picker with an EMPTY registry when the selection is capturable', () => {
    const ctx = ctxOf({ type: 'text', text: 'x', style: { color: '#111' } });
    expect(ctx.styleOptions).toEqual([]);
    expect(ctx.showStyles).toBe(true);
  });

  it('hides the picker when there is neither a style nor anything to capture', () => {
    const ctx = ctxOf({ type: 'text', text: 'x' });
    expect(ctx.showStyles).toBe(false);
  });

  it('gates the border control on the style.border capability', () => {
    expect(ctxOf({ type: 'text', text: 'x' }, {}, ['style.border']).showBorder).toBe(true);
    expect(ctxOf({ type: 'text', text: 'x' }, {}, ['style.color']).showBorder).toBe(false);
  });

  it('trusts the bundled engine when no capability list is supplied', () => {
    expect(ctxOf({ type: 'text', text: 'x' }).showBorder).toBe(true);
  });

  it('resolves the border and radius views the control renders', () => {
    const ctx = ctxOf({
      type: 'rect',
      style: { borderWidth: 2, borderColor: '#f00', borderRadius: '50%' },
    });
    expect(ctx.border.width.effective.top).toBe(2);
    expect(ctx.border.color.effective.left).toBe('#f00');
    expect(ctx.border.width.ownPresent).toBe(true);
    // The AUTHORED form round-trips — `50%` must never be re-expressed in pt.
    expect(ctx.radius.effective).toBe('50%');
  });
});
