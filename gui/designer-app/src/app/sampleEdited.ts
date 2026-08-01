// Whether a preset's sample data has diverged from what shipped — the
// plain-vs-kit gate for the export. A kit is forced when any variant's text
// differs from its preset original OR the user added a variant; declared-but-
// unedited preset variants alone do NOT force a kit (they are the preset's own
// files). Pure so the boundary is unit-testable without the editor.

import { DEFAULT_VARIANT_ID, type PresetVariant, type SampleSet } from '@shojiku/designer';

/** The preset's shipped originals: the default `params.json` text plus the
 * declared variants (by id). */
export interface SampleOriginals {
  readonly params: string;
  readonly variants: readonly PresetVariant[];
}

export function sampleEdited(set: SampleSet, originals: SampleOriginals): boolean {
  for (const variant of set.variants) {
    if (variant.origin === 'user') {
      return true;
    }
    const original =
      variant.id === DEFAULT_VARIANT_ID
        ? originals.params
        : originals.variants.find((v) => v.id === variant.id)?.text;
    if (original === undefined || variant.text !== original) {
      return true;
    }
  }
  return false;
}
