import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG } from './catalog';
import { translate } from './render';
import { usageLabel } from './usageLabel';

/** `t` bound to one language, the way the provider supplies it. */
const at = (lang: string) => (key: string, args?: Record<string, string | number | boolean>) =>
  translate(DEFAULT_CATALOG, [lang, 'en'], key, lang, args ?? {});

describe('usageLabel', () => {
  it('picks the SINGULAR key at exactly one reference', () => {
    expect(usageLabel(at('en'), 1)).toBe('Used in 1 place');
    expect(usageLabel(at('en'), 2)).toBe('Used in 2 places');
    expect(usageLabel(at('en'), 11)).toBe('Used in 11 places');
  });

  it('is defined in every shipped language, singular and plural', () => {
    // The parity gate pins that the keys EXIST; this pins that both arms
    // render real text rather than the key itself (which is what `translate`
    // returns for a miss) in each one.
    for (const lang of ['en', 'ja', 'hi', 'fil', 'zh-cn', 'zh-tw']) {
      for (const n of [1, 3]) {
        const label = usageLabel(at(lang), n);
        expect(label).not.toContain('toolbar.styles.usage');
        expect(label).toContain(String(n));
      }
    }
  });

  it('keeps the number locale-formatted through both arms', () => {
    expect(usageLabel(at('en'), 1234)).toBe('Used in 1,234 places');
  });
});
