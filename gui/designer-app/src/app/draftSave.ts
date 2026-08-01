// The local draft envelope: what a working copy persists, and whether it needs
// persisting at all. ONE home for the envelope's field set — the autosave, the
// standalone explicit save (which needs the store's typed outcome) and a
// restore-point restore all build it here, so a field can never be dropped on
// one path and kept on another.
//
// Pure over an explicit context, so the boundary is unit-testable without the
// editor. `fonts` is an ACCESSOR, not a snapshot: a pick and a restore both
// persist AFTER their async font install settles, and a render-time snapshot
// would save the pre-install list.

import type { Op, SampleSet, TemplateDoc } from '@shojiku/designer';
import { toStored } from '@shojiku/designer';
import type { InstalledFont } from '../fonts/library';
import type { DraftStore } from '../persistence/drafts';
import { isPristine } from './pristine';
import type { PresetFiles } from './services';

/** Fields a caller overrides for THIS save. Each key that can legitimately be
 * reset to undefined (definitions, name, the edit ops) is read with
 * `'key' in over`, so a caller CLEARING one is distinct from one leaving it
 * untouched. */
export interface DraftOver {
  text?: string;
  sample?: SampleSet;
  definitions?: string;
  definitionsEdits?: readonly Op[];
  name?: string;
}

/** The live working copy the draft is built from. */
export interface DraftContext {
  readonly drafts: DraftStore;
  readonly docKey: string;
  /** The preset's shipped files — the pristine baseline (never the restored
   * seed, or a draft carrying only a picked font would read as unchanged). */
  readonly files: PresetFiles;
  readonly currentText: string;
  readonly sampleSet: SampleSet;
  /** The EFFECTIVE definitions (workshop mode stub, or the engineer file with the
   * data-item editor's edits folded in). */
  readonly definitions: string | undefined;
  readonly definitionsEdits: readonly Op[] | undefined;
  readonly customName: string | undefined;
  /** Read LATE — see the module header. */
  readonly fonts: () => readonly InstalledFont[];
  readonly rev: string | undefined;
}

/** Whether the working copy (with `over` applied) equals a FRESH preset open
 * across every part the envelope carries. */
export function pristineWith(ctx: DraftContext, over: DraftOver): boolean {
  return isPristine({
    text: over.text ?? ctx.currentText,
    source: ctx.files.source,
    sampleSet: over.sample ?? ctx.sampleSet,
    originals: { params: ctx.files.params, variants: ctx.files.variants },
    definitions: 'definitions' in over ? over.definitions : ctx.definitions,
    fonts: ctx.fonts(),
    customName: 'name' in over ? over.name : ctx.customName,
  });
}

/** The draft envelope for the working copy with `over` applied. */
export function buildDraft(ctx: DraftContext, over: DraftOver): TemplateDoc {
  const edits = 'definitionsEdits' in over ? over.definitionsEdits : ctx.definitionsEdits;
  return {
    text: over.text ?? ctx.currentText,
    fonts: ctx.fonts(),
    rev: ctx.rev,
    sample: toStored(over.sample ?? ctx.sampleSet),
    definitions: over.definitions ?? ctx.definitions,
    definitionsEdits: edits !== undefined && edits.length > 0 ? edits : undefined,
    name: 'name' in over ? over.name : ctx.customName,
  };
}

/** Autosave the working copy — or CLEAR the draft when it is pristine, so the
 * next open shows no phantom restore prompt. Fire-and-forget: the autosave has
 * no outcome to surface (the explicit save does, and awaits it itself). */
export function saveDraft(ctx: DraftContext, over: DraftOver = {}): void {
  if (pristineWith(ctx, over)) {
    ctx.drafts.clear(ctx.docKey);
    return;
  }
  void ctx.drafts.save(ctx.docKey, buildDraft(ctx, over));
}
