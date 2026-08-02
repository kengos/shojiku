import { buildSampleSet, type SampleSet } from '@shojiku/designer';
import { describe, expect, it, vi } from 'vitest';
import type { InstalledFont } from '../fonts/library';
import type { DraftStore } from '../persistence/drafts';
import { buildDraft, type DraftContext, pristineWith, saveDraft } from './draftSave';
import type { PresetFiles } from './services';

const SOURCE = 'sections:\n  body:\n    type: flow\n    items: []\n';
const PARAMS = '{"a":1}';

const FILES: PresetFiles = {
  source: SOURCE,
  params: PARAMS,
  assets: [],
  variants: [],
};

const FONT: InstalledFont = {
  id: 'gf-x',
  manifest: 'id: gf-x\n',
  licence: 'OFL',
} as unknown as InstalledFont;

/** A store that records what it was asked to do. */
function store() {
  const saved: { key: string; doc: unknown }[] = [];
  const cleared: string[] = [];
  return {
    saved,
    cleared,
    store: {
      save: vi.fn(async (key: string, doc: unknown) => {
        saved.push({ key, doc });
        return { ok: true } as const;
      }),
      clear: vi.fn((key: string) => {
        cleared.push(key);
      }),
    } as unknown as DraftStore,
  };
}

/** A context describing a FRESH preset open (the pristine baseline). */
function context(over: Partial<DraftContext> = {}, drafts?: DraftStore): DraftContext {
  return {
    drafts: drafts ?? store().store,
    docKey: 'receipt-ja',
    files: FILES,
    currentText: SOURCE,
    sampleSet: buildSampleSet(PARAMS, []),
    definitions: undefined,
    definitionsEdits: undefined,
    customName: undefined,
    fonts: () => [],
    rev: undefined,
    ...over,
  };
}

/** The same set with the default variant's params text edited. */
function editedSample(): SampleSet {
  return { active: 'default', variants: [{ id: 'default', text: '{"a":2}', origin: 'preset' }] };
}

describe('pristineWith', () => {
  it('is pristine for a working copy identical to a fresh preset open', () => {
    expect(pristineWith(context(), {})).toBe(true);
  });

  it('is NOT pristine when the template text differs', () => {
    expect(pristineWith(context({ currentText: `${SOURCE}# edited\n` }), {})).toBe(false);
  });

  it('is NOT pristine when the sample data was edited', () => {
    expect(pristineWith(context({ sampleSet: editedSample() }), {})).toBe(false);
  });

  it('is NOT pristine when an inferred definitions stub exists', () => {
    expect(pristineWith(context({ definitions: 'properties: {}\n' }), {})).toBe(false);
  });

  it('is NOT pristine when a font was picked', () => {
    expect(pristineWith(context({ fonts: () => [FONT] }), {})).toBe(false);
  });

  it('is NOT pristine when the document was renamed', () => {
    expect(pristineWith(context({ customName: '請求書 2月' }), {})).toBe(false);
  });

  it('reads the font list LATE, so a pick during the same render counts', () => {
    let picked: readonly InstalledFont[] = [];
    const ctx = context({ fonts: () => picked });
    expect(pristineWith(ctx, {})).toBe(true);
    picked = [FONT];
    expect(pristineWith(ctx, {})).toBe(false);
  });

  it('applies an override in place of the live value', () => {
    // Live text is edited, but this save is about reverting it.
    const ctx = context({ currentText: `${SOURCE}# edited\n` });
    expect(pristineWith(ctx, { text: SOURCE })).toBe(true);
  });

  it('distinguishes CLEARING definitions from leaving them untouched', () => {
    const ctx = context({ definitions: 'properties: {}\n' });
    // Present-but-undefined = the caller cleared the stub → back to pristine.
    expect(pristineWith(ctx, { definitions: undefined })).toBe(true);
    // Absent = untouched → the live stub still counts.
    expect(pristineWith(ctx, {})).toBe(false);
  });

  it('distinguishes CLEARING the rename from leaving it untouched', () => {
    const ctx = context({ customName: '請求書 2月' });
    expect(pristineWith(ctx, { name: undefined })).toBe(true);
    expect(pristineWith(ctx, {})).toBe(false);
  });
});

describe('buildDraft', () => {
  it('carries every part of the working copy into one envelope', () => {
    const doc = buildDraft(
      context({
        currentText: 'edited',
        sampleSet: editedSample(),
        definitions: 'properties: {}\n',
        definitionsEdits: [
          { op: 'setScalar', keys: ['properties', 'amount', 'label'], value: '金額' },
        ],
        customName: '請求書',
        fonts: () => [FONT],
        rev: 'r7',
      }),
      {},
    );
    expect(doc).toEqual({
      text: 'edited',
      fonts: [FONT],
      rev: 'r7',
      sample: { active: 'default', variants: [{ id: 'default', text: '{"a":2}' }] },
      definitions: 'properties: {}\n',
      definitionsEdits: [
        { op: 'setScalar', keys: ['properties', 'amount', 'label'], value: '金額' },
      ],
      name: '請求書',
    });
  });

  it('collapses an EMPTY definition-edit list to undefined', () => {
    // An empty list would otherwise re-seed the Designer with a no-op layer.
    expect(buildDraft(context({ definitionsEdits: [] }), {}).definitionsEdits).toBeUndefined();
    expect(buildDraft(context(), { definitionsEdits: [] }).definitionsEdits).toBeUndefined();
  });

  it('reads the font list LATE (a restore settles after the call is planned)', () => {
    let restored: readonly InstalledFont[] = [];
    const ctx = context({ fonts: () => restored });
    restored = [FONT];
    expect(buildDraft(ctx, {}).fonts).toEqual([FONT]);
  });
});

describe('saveDraft', () => {
  it('CLEARS the draft when the working copy is pristine (no phantom prompt)', () => {
    const s = store();
    saveDraft(context({}, s.store));
    expect(s.cleared).toEqual(['receipt-ja']);
    expect(s.saved).toHaveLength(0);
  });

  it('writes the envelope under the document key when it is not pristine', () => {
    const s = store();
    saveDraft(context({ currentText: 'edited' }, s.store), { text: 'edited' });
    expect(s.cleared).toHaveLength(0);
    expect(s.saved).toHaveLength(1);
    expect(s.saved[0].key).toBe('receipt-ja');
    expect((s.saved[0].doc as { text: string }).text).toBe('edited');
  });

  it('judges pristineness against the OVERRIDE, not only the live copy', () => {
    const s = store();
    // The live text is edited, but this save reverts it — nothing to keep.
    saveDraft(context({ currentText: 'edited' }, s.store), { text: SOURCE });
    expect(s.cleared).toEqual(['receipt-ja']);
    expect(s.saved).toHaveLength(0);
  });
});
