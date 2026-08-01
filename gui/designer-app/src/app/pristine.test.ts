import { buildSampleSet, updateActive } from '@shojiku/designer';
import { describe, expect, it } from 'vitest';
import type { InstalledFont } from '../fonts/library';
import { isPristine, type PristineState } from './pristine';

const LATO: InstalledFont = {
  packId: 'lato',
  familyId: 'Lato',
  displayName: 'Lato',
  manifest: '',
  licenseFile: 'OFL.txt',
  licenseText: '',
};

const SOURCE = 'sections:\n  body:\n    type: flow\n    items: []\n';

function state(over: Partial<PristineState> = {}): PristineState {
  return {
    text: SOURCE,
    source: SOURCE,
    sampleSet: buildSampleSet('{"a":1}', []),
    originals: { params: '{"a":1}', variants: [] },
    definitions: undefined,
    fonts: [],
    customName: undefined,
    ...over,
  };
}

describe('isPristine', () => {
  it('is true when the working copy equals a fresh preset open', () => {
    expect(isPristine(state())).toBe(true);
  });

  it('is false when the text diverged from the preset source', () => {
    expect(isPristine(state({ text: `${SOURCE}# edited\n` }))).toBe(false);
  });

  it('is false when the sample data was edited (a text-pristine session)', () => {
    // Text still equals the source, but the sample diverged — the autosave must
    // still run, or the sample edit is lost.
    expect(
      isPristine(state({ sampleSet: updateActive(buildSampleSet('{"a":1}', []), '{"a":9}') })),
    ).toBe(false);
  });

  it('is false when an inferred definitions stub is present', () => {
    expect(isPristine(state({ definitions: 'type: object\n' }))).toBe(false);
  });

  it('is false when a font was picked (or a restored draft carried one)', () => {
    expect(isPristine(state({ fonts: [LATO] }))).toBe(false);
  });

  it('is false when the title was renamed (a text-pristine session)', () => {
    // A name-only change must persist — clearing the draft would lose it.
    expect(isPristine(state({ customName: 'My invoice' }))).toBe(false);
  });
});
