// The anchor targets of the item at `path`, for the two pickers that write an
// anchor (`EllipseAnchorField`, `LinePointsEditor`). Read from the DOCUMENT's
// id namespace (`ids/anchorTargets`), never the preview's box index: the list
// must not depend on whether the last render landed, and an item without an
// `id:` is a target too — picking it names it.

import { useMemo } from 'react';
import type { EditorController } from '../editor/useEditor';
import { anchorCandidates } from '../ids/anchorTargets';
import { buildIdIndex, type IdIndex } from '../ids/idIndex';
import type { IdHolder } from '../ids/walk';

export interface AnchorTargets {
  readonly index: IdIndex;
  readonly candidates: readonly IdHolder[];
}

export function useAnchorTargets(controller: EditorController, path: string): AnchorTargets {
  const { read, revision } = controller;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `revision` is the change signal for what `read` returns
  return useMemo(() => {
    const index = buildIdIndex(read);
    return { index, candidates: anchorCandidates(index, path) };
  }, [read, revision, path]);
}
