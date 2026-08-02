import { describe, expect, it } from 'vitest';
import type { EffectiveValue, StyleOrigin } from './effective';
import { hintTitle, originHint } from './fmtChrome';

/** A translate stub that reports the KEY (and any interpolated name), so the
 * assertions pin which catalog entry a given origin resolves to. */
const t = ((key: string, args?: Record<string, unknown>) =>
  args === undefined ? key : `${key}:${String(args.name)}`) as never;

function ev(origin: StyleOrigin, styleName = ''): EffectiveValue {
  return { value: 'x', cascade: '', own: '', origin, styleName };
}

describe('originHint', () => {
  it('names the winning style for a style-sourced value', () => {
    expect(originHint(t, ev('style', 'heading'))).toBe('toolbar.origin.style:heading');
  });

  it('reports an inherited value', () => {
    expect(originHint(t, ev('inherited'))).toBe('toolbar.origin.inherited');
  });

  it('reads BOTH defaults.style and the engine floor as one 既定値', () => {
    // The user's mental model is a single "document default", not two cascade
    // layers — so these two origins must not produce different hints.
    expect(originHint(t, ev('default'))).toBe('toolbar.origin.default');
    expect(originHint(t, ev('engine'))).toBe('toolbar.origin.default');
  });

  it('offers NO hint for an own-authored value (nothing to explain)', () => {
    expect(originHint(t, ev('own'))).toBeUndefined();
  });

  it('offers no hint for an unset value', () => {
    expect(originHint(t, ev('unset'))).toBeUndefined();
  });
});

describe('hintTitle', () => {
  it('appends the origin so a hover always says what the control DOES', () => {
    expect(hintTitle('文字色', 'toolbar.origin.inherited')).toBe(
      '文字色 — toolbar.origin.inherited',
    );
  });

  it('falls back to the bare label when there is no origin to add', () => {
    expect(hintTitle('文字色', undefined)).toBe('文字色');
  });
});
