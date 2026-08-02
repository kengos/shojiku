import { describe, expect, it } from 'vitest';
import {
  activeText,
  addVariant,
  buildSampleSet,
  DEFAULT_VARIANT_ID,
  MAX_VARIANTS,
  type PresetVariant,
  removeVariant,
  type SampleSet,
  switchVariant,
  updateActive,
  variantDisplayName,
} from './variants';
import { restoreSampleSet, toStored } from './variantsStore';

const FILLED = '{"a":1}';
const BLANK = '{"a":""}';

const PRESET_VARIANTS: readonly PresetVariant[] = [
  { id: 'blank', name: { ja: '空欄', en: 'Blank' }, text: BLANK },
];

const t = (key: string) => `t:${key}`;

describe('buildSampleSet', () => {
  it('seeds the default variant first and active with no preset variants', () => {
    const set = buildSampleSet(FILLED, []);
    expect(set.active).toBe(DEFAULT_VARIANT_ID);
    expect(set.variants).toHaveLength(1);
    expect(set.variants[0]).toEqual({ id: DEFAULT_VARIANT_ID, text: FILLED, origin: 'preset' });
  });

  it('appends preset variants after the default, carrying their labels', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(set.variants.map((v) => v.id)).toEqual([DEFAULT_VARIANT_ID, 'blank']);
    expect(set.variants[1]).toEqual({
      id: 'blank',
      text: BLANK,
      origin: 'preset',
      labels: { ja: '空欄', en: 'Blank' },
    });
    expect(activeText(set)).toBe(FILLED);
  });

  it('caps the total variant count', () => {
    const many: PresetVariant[] = Array.from({ length: MAX_VARIANTS + 5 }, (_, i) => ({
      id: `v${i}`,
      name: { en: `V${i}` },
      text: '{}',
    }));
    const set = buildSampleSet(FILLED, many);
    expect(set.variants).toHaveLength(MAX_VARIANTS);
  });
});

describe('activeText', () => {
  it('returns the active variant text, or empty for an empty set', () => {
    expect(activeText(buildSampleSet(FILLED, PRESET_VARIANTS))).toBe(FILLED);
    expect(activeText({ active: 'x', variants: [] })).toBe('');
  });
});

describe('switchVariant', () => {
  it('switches to a known id', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    const next = switchVariant(set, 'blank');
    expect(next.active).toBe('blank');
    expect(activeText(next)).toBe(BLANK);
  });

  it('is a no-op (same reference) for an unknown id', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(switchVariant(set, 'nope')).toBe(set);
  });

  it('is a no-op when the id is already active', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(switchVariant(set, DEFAULT_VARIANT_ID)).toBe(set);
  });
});

describe('updateActive', () => {
  it('rewrites only the active variant text', () => {
    const set = switchVariant(buildSampleSet(FILLED, PRESET_VARIANTS), 'blank');
    const next = updateActive(set, '{"a":"x"}');
    expect(next.variants[0].text).toBe(FILLED); // default untouched
    expect(next.variants[1].text).toBe('{"a":"x"}');
    expect(next.active).toBe('blank');
  });

  it('is a no-op (same reference) when the text is unchanged', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(updateActive(set, FILLED)).toBe(set);
  });

  it('is a no-op on an empty set', () => {
    const empty: SampleSet = { active: 'x', variants: [] };
    expect(updateActive(empty, 'y')).toBe(empty);
  });
});

describe('addVariant', () => {
  it('duplicates the active text, allocates user-1, and activates it', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    const result = addVariant(set, 'My copy');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.set.active).toBe('user-1');
    const added = result.set.variants[2];
    expect(added).toEqual({ id: 'user-1', text: FILLED, origin: 'user', name: 'My copy' });
  });

  it('skips an existing user-n id', () => {
    let set = buildSampleSet(FILLED, PRESET_VARIANTS);
    set = (addVariant(set, 'a') as { ok: true; set: SampleSet }).set; // user-1
    const result = addVariant(set, 'b');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.variants.some((v) => v.id === 'user-2')).toBe(true);
    }
  });

  it('refuses an empty/whitespace name', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(addVariant(set, '   ')).toEqual({ ok: false, reason: 'empty_name' });
  });

  it('refuses when at the cap', () => {
    let set = buildSampleSet(FILLED, []);
    while (set.variants.length < MAX_VARIANTS) {
      set = (addVariant(set, `n${set.variants.length}`) as { ok: true; set: SampleSet }).set;
    }
    expect(addVariant(set, 'over')).toEqual({ ok: false, reason: 'too_many' });
  });
});

describe('removeVariant', () => {
  it('removes a user variant', () => {
    const set = (addVariant(buildSampleSet(FILLED, []), 'copy') as { ok: true; set: SampleSet })
      .set;
    const result = removeVariant(set, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.variants.map((v) => v.id)).toEqual([DEFAULT_VARIANT_ID]);
    }
  });

  it('reassigns active to the first remaining when the active is removed', () => {
    const added = addVariant(buildSampleSet(FILLED, []), 'copy') as { ok: true; set: SampleSet };
    expect(added.set.active).toBe('user-1');
    const result = removeVariant(added.set, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.active).toBe(DEFAULT_VARIANT_ID);
    }
  });

  it('keeps active unchanged when removing a non-active variant', () => {
    let set = buildSampleSet(FILLED, []);
    set = (addVariant(set, 'a') as { ok: true; set: SampleSet }).set; // user-1, active
    set = (addVariant(set, 'b') as { ok: true; set: SampleSet }).set; // user-2, active
    const result = removeVariant(set, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.active).toBe('user-2');
    }
  });

  it('refuses removing a preset-origin variant', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(removeVariant(set, 'blank')).toEqual({ ok: false, reason: 'not_removable' });
    expect(removeVariant(set, DEFAULT_VARIANT_ID)).toEqual({ ok: false, reason: 'not_removable' });
  });

  it('refuses removing the last variant', () => {
    let set = buildSampleSet('{}', []);
    // Turn the sole variant into a user one by construction is impossible via
    // the API; instead verify the last-variant guard with a one-user set.
    set = { active: 'user-1', variants: [{ id: 'user-1', text: '{}', origin: 'user', name: 'x' }] };
    expect(removeVariant(set, 'user-1')).toEqual({ ok: false, reason: 'last_variant' });
  });

  it('is a silent no-op for an unknown id', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    const result = removeVariant(set, 'nope');
    expect(result).toEqual({ ok: true, set });
  });
});

describe('variantDisplayName', () => {
  it('renders a preset label down the locale chain', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(variantDisplayName(set.variants[1], 'ja-JP', t)).toBe('空欄');
    expect(variantDisplayName(set.variants[1], 'en-US', t)).toBe('Blank');
  });

  it('renders the default chrome key for the default variant', () => {
    const set = buildSampleSet(FILLED, PRESET_VARIANTS);
    expect(variantDisplayName(set.variants[0], 'ja-JP', t)).toBe('t:sample.variant.default');
  });

  it('renders a user variant name verbatim, clipped', () => {
    const long = 'x'.repeat(80);
    const set = (addVariant(buildSampleSet(FILLED, []), long) as { ok: true; set: SampleSet }).set;
    const shown = variantDisplayName(set.variants[1], 'ja-JP', t);
    expect(shown.endsWith('…')).toBe(true);
    expect(shown.length).toBe(61);
  });

  it('falls back to the clipped id for an orphan preset variant', () => {
    const orphan: SampleSet = {
      active: 'gone',
      variants: [{ id: 'gone', text: '{}', origin: 'preset' }],
    };
    expect(variantDisplayName(orphan.variants[0], 'ja-JP', t)).toBe('gone');
  });

  it('falls back to the clipped id when labels miss the chain', () => {
    const v = { id: 'x', text: '{}', origin: 'preset', labels: { fr: 'Fr' } } as const;
    expect(variantDisplayName(v, 'ja-JP', t)).toBe('x');
  });
});

describe('hostile ids and names stay inert own-data', () => {
  it('handles __proto__/constructor/toString as a preset variant id without polluting', () => {
    const preset: PresetVariant[] = [
      { id: '__proto__', name: { en: 'P' }, text: '{}' },
      { id: 'constructor', name: { en: 'C' }, text: '{}' },
      { id: 'toString', name: { en: 'T' }, text: '{}' },
    ];
    const set = buildSampleSet(FILLED, preset);
    expect(switchVariant(set, '__proto__').active).toBe('__proto__');
    expect(switchVariant(set, 'toString').active).toBe('toString');
    expect(variantDisplayName(set.variants[3], 'en', t)).toBe('T');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    // restore round-trip with the hostile ids
    const restored = restoreSampleSet(toStored(set), preset);
    expect(restored.variants.map((v) => v.id)).toEqual([
      DEFAULT_VARIANT_ID,
      '__proto__',
      'constructor',
      'toString',
    ]);
  });

  it('handles __proto__ as a user variant name', () => {
    const set = addVariant(buildSampleSet(FILLED, []), '__proto__');
    expect(set.ok).toBe(true);
    if (set.ok) {
      expect(variantDisplayName(set.set.variants[1], 'en', t)).toBe('__proto__');
    }
  });

  it('treats a literal-JSON proto-pollution params value as opaque text (no pollution)', () => {
    // The variant model holds params text OPAQUELY (never parses it), so a
    // hostile value rides through the edit path as an inert string. A LITERAL
    // JSON string is required — an object literal would set the prototype in
    // the test source and serialize to `{}`.
    const hostile = '{"__proto__":{"polluted":1}}';
    const set = updateActive(buildSampleSet(FILLED, []), hostile);
    expect(activeText(set)).toBe(hostile);
    const restored = restoreSampleSet(toStored(set), []);
    expect(restored.variants[0].text).toBe(hostile);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
