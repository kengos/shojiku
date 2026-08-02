import { addVariant, buildSampleSet, type SampleSet, updateActive } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import { sampleEdited } from './sampleEdited';

const PRESET = [{ id: 'blank', name: { en: 'Blank' }, text: '{"a":""}' }];
const ORIGINALS = { params: '{"a":1}', variants: PRESET };

describe('sampleEdited', () => {
  it('is false for the pristine preset set (default + declared variants unedited)', () => {
    const set = buildSampleSet('{"a":1}', PRESET);
    expect(sampleEdited(set, ORIGINALS)).toBe(false);
  });

  it('is true when the default variant text was edited', () => {
    const set = updateActive(buildSampleSet('{"a":1}', PRESET), '{"a":9}');
    expect(sampleEdited(set, ORIGINALS)).toBe(true);
  });

  it('is true when a declared preset variant text was edited', () => {
    let set = buildSampleSet('{"a":1}', PRESET);
    set = { ...set, active: 'blank' };
    set = updateActive(set, '{"a":"x"}');
    expect(sampleEdited(set, ORIGINALS)).toBe(true);
  });

  it('is true when the user added a variant', () => {
    const set = (
      addVariant(buildSampleSet('{"a":1}', PRESET), 'copy') as { ok: true; set: SampleSet }
    ).set;
    expect(sampleEdited(set, ORIGINALS)).toBe(true);
  });

  it('is true for an orphan preset variant the originals no longer declare', () => {
    const set: SampleSet = {
      active: 'default',
      variants: [
        { id: 'default', text: '{"a":1}', origin: 'preset' },
        { id: 'gone', text: '{}', origin: 'preset' },
      ],
    };
    expect(sampleEdited(set, ORIGINALS)).toBe(true);
  });
});
