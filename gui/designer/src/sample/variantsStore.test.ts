import { describe, expect, it } from 'vitest';
import {
  addVariant,
  buildSampleSet,
  DEFAULT_VARIANT_ID,
  MAX_VARIANTS,
  type PresetVariant,
  type SampleSet,
  updateActive,
} from './variants';
import { restoreSampleSet, type StoredSampleSet, toStored } from './variantsStore';

const FILLED = '{"a":1}';
const BLANK = '{"a":""}';

const PRESET_VARIANTS: readonly PresetVariant[] = [
  { id: 'blank', name: { ja: '空欄', en: 'Blank' }, text: BLANK },
];

describe('toStored / restoreSampleSet', () => {
  it('round-trips a set through the stored shape, re-attaching preset labels', () => {
    let set = buildSampleSet(FILLED, PRESET_VARIANTS);
    set = (addVariant(set, 'My copy') as { ok: true; set: SampleSet }).set;
    set = updateActive(set, '{"a":"edited"}');
    const stored = toStored(set);
    expect(stored.variants[0]).toEqual({ id: DEFAULT_VARIANT_ID, text: FILLED }); // labels stripped
    expect(stored.variants[2]).toEqual({ id: 'user-1', text: '{"a":"edited"}', name: 'My copy' });

    const restored = restoreSampleSet(stored, PRESET_VARIANTS);
    expect(restored.active).toBe('user-1');
    expect(restored.variants[1]).toEqual({
      id: 'blank',
      text: BLANK,
      origin: 'preset',
      labels: { ja: '空欄', en: 'Blank' },
    });
    expect(restored.variants[2]).toEqual({
      id: 'user-1',
      text: '{"a":"edited"}',
      origin: 'user',
      name: 'My copy',
    });
  });

  it('restores a preset id the catalog no longer knows as a label-less orphan', () => {
    const stored: StoredSampleSet = {
      active: DEFAULT_VARIANT_ID,
      variants: [
        { id: DEFAULT_VARIANT_ID, text: FILLED },
        { id: 'gone', text: '{}' },
      ],
    };
    const restored = restoreSampleSet(stored, []);
    expect(restored.variants[1]).toEqual({ id: 'gone', text: '{}', origin: 'preset' });
  });

  it('falls back active to the first variant when the stored active is absent', () => {
    const stored: StoredSampleSet = {
      active: 'missing',
      variants: [{ id: DEFAULT_VARIANT_ID, text: FILLED }],
    };
    expect(restoreSampleSet(stored, []).active).toBe(DEFAULT_VARIANT_ID);
  });

  it('falls back active to the default id when the stored set is empty', () => {
    const restored = restoreSampleSet({ active: 'x', variants: [] }, []);
    expect(restored.active).toBe(DEFAULT_VARIANT_ID);
  });

  it('appends declared preset variants missing from the stored set (older draft)', () => {
    // Preset variants cannot be user-removed, so a v3-upgraded (one-variant)
    // stored set gains the preset's declared variants back on restore — the
    // switcher must not stay hidden for pre-existing drafts.
    const v3Upgraded: StoredSampleSet = {
      active: DEFAULT_VARIANT_ID,
      variants: [{ id: DEFAULT_VARIANT_ID, text: '{"a":"edited"}' }],
    };
    const restored = restoreSampleSet(v3Upgraded, PRESET_VARIANTS);
    expect(restored.variants.map((v) => v.id)).toEqual([DEFAULT_VARIANT_ID, 'blank']);
    expect(restored.variants[0].text).toBe('{"a":"edited"}'); // the edit survives
    expect(restored.variants[1]).toEqual({
      id: 'blank',
      text: BLANK,
      origin: 'preset',
      labels: { ja: '空欄', en: 'Blank' },
    });
    expect(restored.active).toBe(DEFAULT_VARIANT_ID);
  });

  it('does not duplicate a preset variant the stored set already carries', () => {
    const stored = toStored(buildSampleSet(FILLED, PRESET_VARIANTS));
    const restored = restoreSampleSet(stored, PRESET_VARIANTS);
    expect(restored.variants.filter((v) => v.id === 'blank')).toHaveLength(1);
  });

  it('respects the cap when appending missing preset variants', () => {
    const declared: PresetVariant[] = Array.from({ length: MAX_VARIANTS }, (_, i) => ({
      id: `v${i}`,
      name: { en: `V${i}` },
      text: '{}',
    }));
    const stored: StoredSampleSet = {
      active: DEFAULT_VARIANT_ID,
      variants: [{ id: DEFAULT_VARIANT_ID, text: '{}' }],
    };
    expect(restoreSampleSet(stored, declared).variants.length).toBe(MAX_VARIANTS);
  });
});
