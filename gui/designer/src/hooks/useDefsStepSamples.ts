// The sample-data half of an undo / redo that crosses a definitions step. The
// template and the definitions edit list come back from the history's own
// snapshots; the samples are a document of their own, so a rename / delete
// step's EFFECT is re-applied to them here — backward on undo, forward on
// redo — whichever control moved the history (the toolbar, ⌘Z, or the
// data-item editor's undo). Mounted with the document, not with the data-item
// editor: the toolbar undo happens while that editor is closed.

import { useEffect, useRef } from 'react';
import type { DefsEdits, DefsEffect } from '../data/defsStep';
import { samplesAcross } from '../data/deletePlan';
import type { DocumentEditor } from '../editor/useEditor';
import type { SampleData } from './useSampleData';

export function useDefsStepSamples(
  editor: DocumentEditor<DefsEdits, DefsEffect>,
  sample: SampleData,
  sampleReadOnly: boolean,
): void {
  // The listener outlives renders; it reads the newest sample handle.
  const sampleRef = useRef(sample);
  sampleRef.current = sample;
  const { subscribe } = editor;
  useEffect(
    () =>
      subscribe((change) => {
        if (sampleReadOnly || change.effect === undefined || change.source === 'batch') {
          return;
        }
        const live = sampleRef.current;
        const current = live.sampleSetRef.current;
        const next = samplesAcross(current, change.effect, change.source === 'undo');
        if (next !== current) {
          live.handleVariantCommit(next);
        }
      }),
    [subscribe, sampleReadOnly],
  );
}
