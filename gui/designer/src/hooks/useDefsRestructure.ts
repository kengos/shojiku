// Renaming and deleting a data item as ONE user action across the three
// documents it touches — the template (its rewrite) and the definitions edit
// list land as ONE step on the template's undo stack (the edit list is that
// history's companion, `data/defsStep.ts`), and every sample variant moves with
// them — and the data-item editor's undo, which walks that same stack.
//
// The plans are pure (`data/renamePlan.ts`, `data/deletePlan.ts`); this hook
// reads the live documents, asks for a plan, and applies it template-first: the
// template batch is the one half that can still refuse at apply time, so the
// samples move only after it lands. An undo or redo of the step re-applies its
// sample half wherever the history is moved from (`useDefsStepSamples`).

import type { DefsEdits, DefsEffect } from '../data/defsStep';
import type { DefsNode } from '../data/defsTree';
import { planDelete } from '../data/deletePlan';
import { readDataRefs } from '../data/refs/walk';
import {
  planRename,
  type RestructureInput,
  type RestructurePlan,
  type RestructureRefusal,
} from '../data/renamePlan';
import type { DocumentEditor } from '../editor/useEditor';
import type { SampleSet } from '../sample/variants';
import type { DefinitionsOwnership } from './useDefinitionsOwnership';
import type { SampleData } from './useSampleData';

export interface DefsRestructure {
  /** Rename `node` to `name`; the refusal when nothing changed. */
  readonly rename: (node: DefsNode, name: string) => RestructureRefusal | null;
  /** Delete `node`; the refusal when nothing changed. */
  readonly remove: (node: DefsNode) => RestructureRefusal | null;
  /** Undo the newest step when it is a definitions step (with its template /
   * sample halves): after a rename, the keys path the node is back at (so the
   * editor can keep it selected); `false` when the next undo is not one. */
  readonly undo: () => boolean | readonly string[];
}

export interface DefsRestructureOptions {
  readonly editor: DocumentEditor<DefsEdits, DefsEffect>;
  readonly sample: SampleData;
  readonly defs: DefinitionsOwnership;
  readonly maxBytes: number;
  /** The host manages the sample data itself (a mounted host): a rename /
   * delete leaves it as it is. */
  readonly sampleReadOnly: boolean;
}

export function useDefsRestructure({
  editor,
  sample,
  defs,
  maxBytes,
  sampleReadOnly,
}: DefsRestructureOptions): DefsRestructure {
  const commitSamples = (next: SampleSet) => {
    if (!sampleReadOnly && next !== sample.sampleSet) {
      sample.handleVariantCommit(next);
    }
  };
  const input = (): RestructureInput => ({
    definitions: defs.effectiveDefinitions ?? '',
    base: defs.base,
    edits: defs.edits,
    templateText: editor.text,
    refs: readDataRefs(editor.text),
    maxBytes,
    sampleSet: sample.sampleSet,
  });

  // Template and definitions in one step (the template half is the one that can
  // still refuse), then the samples — so a refusal leaves every document as it
  // was.
  const apply = (plan: RestructurePlan): RestructureRefusal | null => {
    if (!plan.ok) {
      return plan.reason;
    }
    const step = { companion: plan.edits, effect: plan.effect };
    if (!editor.applyAll(plan.templateOps, step).ok) {
      return 'too_large';
    }
    commitSamples(plan.sampleSet);
    return null;
  };

  const undo = (): boolean | readonly string[] => {
    const effect = editor.undoEffect;
    if (effect === undefined) {
      return false;
    }
    editor.undo();
    return effect.kind === 'rename' ? [...effect.parent, effect.from] : true;
  };

  return {
    rename: (node, name) => apply(planRename(input(), node, name)),
    remove: (node) => apply(planDelete(input(), node)),
    undo,
  };
}
