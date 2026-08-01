// Whether the standalone working copy is identical to a FRESH preset open — the
// guard for skipping (and clearing) the local draft autosave. A preset opened
// and then undone byte-exact back to its source must not leave a draft behind:
// the next open would show a restore prompt with zero real diff.
//
// The baseline is the PRESET's own source (`files.source`/`params`/`variants`),
// NOT the restored-draft seed: a draft that carries picked fonts or an edited
// sample the preset lacks must stay non-pristine, so clearing it never loses
// content the preset could not regenerate. The match is over EVERY part the
// draft envelope carries — text, sample, the inferred stub, and picked fonts —
// so a text undone to the source while the sample was edited (or a font picked)
// is NOT pristine. Pure so the boundary is unit-testable without the editor.

import type { SampleSet } from '@shojiku/designer';
import type { InstalledFont } from '../fonts/library';
import { type SampleOriginals, sampleEdited } from './sampleEdited';

export interface PristineState {
  /** The current template text. */
  readonly text: string;
  /** The PRESET's original template source (`files.source`). */
  readonly source: string;
  /** The current sample-variant set. */
  readonly sampleSet: SampleSet;
  /** The preset's shipped sample originals (params + declared variants). */
  readonly originals: SampleOriginals;
  /** The current workshop mode inferred definitions stub, or undefined. A fresh
   * preset in its opened state produces none. */
  readonly definitions: string | undefined;
  /** The currently picked fonts. A fresh preset has none. */
  readonly fonts: readonly InstalledFont[];
  /** The user's header rename, or undefined when the title still follows the
   * preset / host display name. A fresh preset open has none. */
  readonly customName: string | undefined;
}

/** True only when the working copy is identical to a fresh preset open: source
 * text, unedited sample, no inferred stub, and no picked fonts. Any deviation
 * (an edited sample a text undo left in place, a picked font, a header rename,
 * a restored draft's content) is NOT pristine — the autosave must still run, or
 * that content is lost. */
export function isPristine(state: PristineState): boolean {
  return (
    state.text === state.source &&
    !sampleEdited(state.sampleSet, state.originals) &&
    state.definitions === undefined &&
    state.fonts.length === 0 &&
    state.customName === undefined
  );
}
