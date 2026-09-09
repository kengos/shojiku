// Keeping the format bar in step with the caret. Split out of the editor shell
// because it is the one piece that listens to the DOCUMENT rather than to the
// component: a selection can change without any event reaching the editor —
// dragging out of it, a keyboard extend, the browser's own re-selection after
// an edit — and `selectionchange` is the only notification for those.
//
// The recompute is also returned, because two things change the selection
// without `selectionchange` being observable in jsdom: applying a mark
// (`runFormat` re-selects the painted runs) and the surface's own key and
// pointer handling. Test coverage of the bar's pressed state depends on those
// paths, so they call it directly rather than hoping for the document event.

import { useCallback, useEffect, useState } from 'react';
import { selectionMarks } from './runMarks';
import type { RunMarks } from './spanRuns';

/** The marks the current selection shares, `null` when there is none — which is
 * what disables the bar. */
export function useSelectionMarks(root: HTMLElement | null): {
  readonly marks: RunMarks | null;
  readonly refresh: () => void;
} {
  const [marks, setMarks] = useState<RunMarks | null>(null);
  const refresh = useCallback(() => {
    setMarks(root === null ? null : selectionMarks(root, root.ownerDocument.getSelection()));
  }, [root]);

  useEffect(() => {
    if (root === null) {
      return;
    }
    const doc = root.ownerDocument;
    doc.addEventListener('selectionchange', refresh);
    return () => doc.removeEventListener('selectionchange', refresh);
  }, [root, refresh]);

  return { marks, refresh };
}
