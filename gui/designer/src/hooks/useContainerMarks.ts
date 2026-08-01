// The container marks the canvas draws (dashed outline + slot guides + kind
// chip): the selected container, plus the parent-card hover target — the impact
// scope shown BEFORE a shared edit.

import { useEffect, useMemo, useState } from 'react';
import type { ContainerMark } from '../canvas/ContainerMarkVisual';
import type { I18n } from '../i18n/context';
import { containerKindLabel, containerLayoutFor } from '../panel/layoutModel';

export interface ContainerMarksOptions {
  readonly selection: string | null;
  readonly read: (path: string) => unknown;
  readonly t: I18n['t'];
  /** The document revision the marks are recomputed against (the `read` fn
   * identity is stable across edits, so the text stands in for it). */
  readonly text: string;
}

export interface ContainerMarks {
  readonly containerMarks: readonly ContainerMark[];
  readonly setHighlightPath: (path: string | null) => void;
}

export function useContainerMarks({
  selection,
  read,
  t,
  text,
}: ContainerMarksOptions): ContainerMarks {
  // The parent-card hover highlight: a container path the canvas marks with
  // the same dashed outline + chip a selected container gets — the impact
  // scope shown BEFORE a shared edit. Cleared when the selection moves (the
  // card unmounts without firing its mouse-leave).
  const [highlightPath, setHighlightPath] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `selection` is the intentional trigger — the highlight clears when the hovered card unmounts on a selection change.
  useEffect(() => {
    setHighlightPath(null);
  }, [selection]);

  // Recomputed per document text (a direction toggle relabels the chip).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `text` stands in for the document revision `read` reflects (the read fn identity is stable across edits).
  const containerMarks = useMemo(() => {
    const marks: ContainerMark[] = [];
    const add = (path: string | null) => {
      if (path === null || marks.some((mark) => mark.path === path)) {
        return;
      }
      const layout = containerLayoutFor(read, path);
      if (layout !== null) {
        marks.push({
          path,
          label: t('canvas.chip.container', { kind: containerKindLabel(t, layout) }),
        });
      }
    };
    add(selection);
    add(highlightPath);
    return marks;
  }, [selection, highlightPath, read, t, text]);

  return { containerMarks, setHighlightPath };
}
