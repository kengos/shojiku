import { describe, expect, it } from 'vitest';
import {
  CURRENCY_SUGGESTIONS,
  currencyOp,
  defaultStyleOp,
  INHERITED_STYLE_FIELDS,
  localeOp,
  readDefaultsView,
} from './defaultsModel';
import type { StyleFieldSpec } from './styleFieldSpecs';

/** A minimal spec for the kind-dispatch tests (the op builders read only
 * `key`/`kind`), avoiding a `.find(...)!` non-null assertion. */
const spec = (key: string, kind: StyleFieldSpec['kind']): StyleFieldSpec => ({
  key,
  labelKey: `panel.field.${key}`,
  kind,
  options: [],
});

describe('readDefaultsView', () => {
  it('reads a present defaults map (locale, currency, inherited style)', () => {
    const view = readDefaultsView({
      locale: 'ja-JP',
      currency: 'JPY',
      style: { fontSize: 12, fontFamily: 'biz-udp-gothic', lineHeight: 1.4 },
    });
    expect(view.locale).toBe('ja-JP');
    expect(view.currency).toBe('JPY');
    expect(view.style.fontSize).toBe('12');
    expect(view.style.fontFamily).toBe('biz-udp-gothic');
    expect(view.style.lineHeight).toBe('1.4');
    // An unset inherited field reads as empty; backgroundColor is not present.
    expect(view.style.color).toBe('');
    expect(view.style).not.toHaveProperty('backgroundColor');
  });

  it('reads an ABSENT defaults key as all-empty', () => {
    const view = readDefaultsView(undefined);
    expect(view.locale).toBe('');
    expect(view.currency).toBe('');
    expect(view.style.fontSize).toBe('');
  });

  it('reads a GARBAGE (non-map) defaults value as all-empty', () => {
    const view = readDefaultsView('not-a-map');
    expect(view.locale).toBe('');
    expect(view.currency).toBe('');
    // A garbage style value degrades the same way.
    expect(readDefaultsView({ style: 42 }).style.fontSize).toBe('');
  });
});

describe('defaults op builders', () => {
  it('localeOp sets a value and clears on empty (root-addressed)', () => {
    expect(localeOp('en-US')).toEqual({
      op: 'setScalar',
      path: undefined,
      keys: ['defaults', 'locale'],
      value: 'en-US',
    });
    expect(localeOp('')).toEqual({
      op: 'removeKey',
      path: undefined,
      keys: ['defaults', 'locale'],
    });
  });

  it('currencyOp sets a value and clears on empty', () => {
    expect(currencyOp('USD')).toMatchObject({ op: 'setScalar', value: 'USD' });
    expect(currencyOp('')).toMatchObject({ op: 'removeKey' });
  });

  it('defaultStyleOp dispatches by field kind, both directions', () => {
    // length: bare number authored as a number, empty clears.
    expect(defaultStyleOp(spec('fontSize', 'length'), '12')).toMatchObject({
      op: 'setScalar',
      value: 12,
    });
    expect(defaultStyleOp(spec('fontSize', 'length'), '')).toMatchObject({ op: 'removeKey' });
    // number: finite sets, non-finite returns null (nothing dispatched), empty clears.
    expect(defaultStyleOp(spec('lineHeight', 'number'), '1.4')).toMatchObject({
      op: 'setScalar',
      value: 1.4,
    });
    expect(defaultStyleOp(spec('lineHeight', 'number'), 'abc')).toBeNull();
    expect(defaultStyleOp(spec('lineHeight', 'number'), '')).toMatchObject({ op: 'removeKey' });
    // select / text: verbatim string, empty clears.
    expect(defaultStyleOp(spec('textAlign', 'select'), 'center')).toMatchObject({
      op: 'setScalar',
      value: 'center',
    });
    expect(defaultStyleOp(spec('textAlign', 'select'), '')).toMatchObject({ op: 'removeKey' });
    expect(defaultStyleOp(spec('fontFamily', 'text'), 'biz-ud-gothic')).toMatchObject({
      op: 'setScalar',
      value: 'biz-ud-gothic',
    });
    expect(defaultStyleOp(spec('fontFamily', 'text'), '')).toMatchObject({ op: 'removeKey' });
  });

  it('roots defaultStyleOp under defaults.style.<prop>', () => {
    expect(defaultStyleOp(spec('fontSize', 'length'), '10')).toMatchObject({
      keys: ['defaults', 'style', 'fontSize'],
    });
  });

  it('authors a hostile locale/currency value verbatim as a scalar (never code)', () => {
    // A document-hostile value is inert data on the wire — the op carries it as
    // a plain string; it is never interpreted as a URL/RegExp/pattern.
    const op = localeOp('javascript:alert(1)');
    expect(op).toMatchObject({ op: 'setScalar', value: 'javascript:alert(1)' });
  });
});

describe('INHERITED_STYLE_FIELDS (drift guard)', () => {
  it('is exactly the inherited subset of STYLE_FIELDS (backgroundColor excluded)', () => {
    expect(INHERITED_STYLE_FIELDS.map((f) => f.key)).toEqual([
      'fontSize',
      'fontFamily',
      'fontWeight',
      'fontStyle',
      'textAlign',
      'lineHeight',
      'color',
    ]);
    expect(INHERITED_STYLE_FIELDS.map((f) => f.key)).not.toContain('backgroundColor');
  });
});

describe('CURRENCY_SUGGESTIONS', () => {
  it('are all 3-letter uppercase ISO 4217 codes', () => {
    for (const code of CURRENCY_SUGGESTIONS) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });
});
