// Renaming and deleting a data item as ONE user action across the three
// documents it touches — the template (one `applyAll` batch, one ⌘Z step), every
// sample variant, and the definitions edit list (one definitions-undo step that
// carries what reverting the other two takes) — and the definitions undo that
// reverts all three.
//
// The plans are pure (`data/renamePlan.ts`, `data/deletePlan.ts`); this hook
// reads the live documents, asks for a plan, and applies it template-first: the
// template batch is the one half that can still refuse at apply time, so the
// samples and the edit list move only after it lands. A definitions undo plans
// its reverse BEFORE popping, so a refused reverse changes nothing at all.

import { peekDefsHistory } from '../data/defsHistory';
import { type DefsNode, readDefsTree } from '../data/defsTree';
import { planDelete, reversePlan } from '../data/deletePlan';
import { readDataRefs } from '../data/refs/walk';
import {
  planRename,
  type RestructureInput,
  type RestructurePlan,
  type RestructureRefusal,
} from '../data/renamePlan';
import type { EditorController } from '../editor/useEditor';
import type { SampleSet } from '../sample/variants';
import type { DefinitionsOwnership } from './useDefinitionsOwnership';
import type { SampleData } from './useSampleData';

export interface DefsRestructure {
  /** Rename `node` to `name`; the refusal when nothing changed. */
  readonly rename: (node: DefsNode, name: string) => RestructureRefusal | null;
  /** Delete `node`; the refusal when nothing changed. */
  readonly remove: (node: DefsNode) => RestructureRefusal | null;
  /** Undo the newest definitions edit (with its template / sample halves):
   * `false` when the reverse was refused and nothing changed; after a rename,
   * the keys path the node is back at (so the editor can keep it selected). */
  readonly undo: () => boolean | readonly string[];
}

export interface DefsRestructureOptions {
  readonly editor: EditorController;
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
  const definitions = defs.effectiveDefinitions ?? '';
  const input = (): RestructureInput => ({
    definitions,
    base: defs.base,
    edits: defs.edits,
    templateText: editor.text,
    refs: readDataRefs(editor.text),
    maxBytes,
    sampleSet: sample.sampleSet,
  });

  // Template first (the one half that can still refuse), then the samples, then
  // the definitions — so a refusal leaves every document as it was.
  const apply = (plan: RestructurePlan): RestructureRefusal | null => {
    if (!plan.ok) {
      return plan.reason;
    }
    if (plan.templateOps.length > 0 && !editor.applyAll(plan.templateOps).ok) {
      return 'too_large';
    }
    commitSamples(plan.sampleSet);
    defs.restructure(plan.edits, plan.companion);
    return null;
  };

  const undo = (): boolean | readonly string[] => {
    const companion = peekDefsHistory(defs.defsHistory)?.companion;
    if (companion !== undefined) {
      const reverse = reversePlan(input(), readDefsTree(definitions), companion);
      if (!reverse.ok) {
        return false;
      }
      if (reverse.templateOps.length > 0 && !editor.applyAll(reverse.templateOps).ok) {
        return false;
      }
      commitSamples(reverse.sampleSet);
    }
    defs.undoDefinition();
    return companion?.kind === 'rename'
      ? [...companion.keysPath.slice(0, -1), companion.name]
      : true;
  };

  return {
    rename: (node, name) => apply(planRename(input(), node, name)),
    remove: (node) => apply(planDelete(input(), node)),
    undo,
  };
}
