import { describe, expect, it } from 'vitest';
import { STYLE_FIELDS } from './styleFieldSpecs';
import { styleOptionLabel, unsetLabel } from './styleLabels';

/** A stand-in translate: returns the key, so a test can see WHICH key a lookup
 * resolved to without depending on catalog wording. */
const key = (k: string) => k;
/** A stand-in that interpolates, for the `{value}` label. */
const interp = (k: string, args?: Record<string, string | number>) =>
  args === undefined ? k : `${k}:${Object.values(args).join(',')}`;

describe('styleOptionLabel', () => {
  it('resolves every option of every enum field STYLE_FIELDS offers', () => {
    // The table must not fall behind the field list — an uncovered option would
    // silently render its wire spelling beside localized siblings.
    for (const spec of STYLE_FIELDS.filter((s) => s.kind === 'select')) {
      for (const option of spec.options) {
        expect([spec.key, option, styleOptionLabel(key, spec.key, option)]).toEqual([
          spec.key,
          option,
          `style.value.${spec.key}.${option}`,
        ]);
      }
    }
  });

  it('falls back to the wire spelling for a field the table does not cover', () => {
    expect(styleOptionLabel(key, 'fontFamily', 'biz-udp-gothic')).toBe('biz-udp-gothic');
  });

  it('falls back to the wire spelling for an option the table does not cover', () => {
    // A new engine variant degrades to its spelling, never to a raw catalog key.
    expect(styleOptionLabel(key, 'fontWeight', 'lighter')).toBe('lighter');
  });

  it('does not read a prototype key as a label table or a label', () => {
    expect(styleOptionLabel(key, 'constructor', 'normal')).toBe('normal');
    expect(styleOptionLabel(key, 'fontWeight', 'constructor')).toBe('constructor');
    expect(styleOptionLabel(key, '__proto__', 'toString')).toBe('toString');
  });
});

describe('unsetLabel', () => {
  it('names the engine fallback, localized, when there is one', () => {
    expect(unsetLabel(interp, 'fontWeight', 'normal')).toBe(
      'defaults.unsetWith:style.value.fontWeight.normal',
    );
  });

  it('names a non-enum fallback verbatim', () => {
    expect(unsetLabel(interp, 'fontSize', '10')).toBe('defaults.unsetWith:10');
  });

  it('says only "not set" when the fallback is host-derived and absent', () => {
    expect(unsetLabel(interp, 'fontFamily', undefined)).toBe('defaults.unset');
  });
});
