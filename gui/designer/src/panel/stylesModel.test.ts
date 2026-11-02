import { describe, expect, it } from 'vitest';
import { readStylesView } from './stylesModel';

describe('readStylesView', () => {
  it('reads ordered entries with editable style-field display values', () => {
    const view = readStylesView({
      heading: { fontSize: 24, textAlign: 'center' },
      framed: { borderWidth: 1 },
    });
    expect(view.map((e) => e.name)).toEqual(['heading', 'framed']);
    expect(view[0].style.fontSize).toBe('24');
    expect(view[0].style.textAlign).toBe('center');
    // A non-STYLE_FIELDS prop (borderWidth) is not surfaced as a field value,
    // but the entry still exists (its value stays on the document untouched).
    expect(view[1].style.fontSize).toBe('');
    // Every own key, editable or not, is carried as authored for the form's
    // 「その他の設定」.
    expect(view[1].values).toEqual({ borderWidth: 1 });
  });

  it('skips an empty-string name (unaddressable by the keys grammar)', () => {
    const view = readStylesView({ '': { fontSize: 10 }, ok: {} });
    expect(view.map((e) => e.name)).toEqual(['ok']);
  });

  it('reads a non-map styles value as no entries', () => {
    expect(readStylesView(undefined)).toEqual([]);
    expect(readStylesView('nope')).toEqual([]);
    // A non-map entry value degrades to empty field values, still listed.
    expect(readStylesView({ a: 42 })[0].style.fontSize).toBe('');
    expect(readStylesView({ a: 42 })[0].values).toEqual({});
  });
});
