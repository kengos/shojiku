// The page's own anatomy, painted UNDER the interactive layer: the snap grid
// and the margin-box guide. Not gestures and not decorations — these describe
// the PAPER, which is why they sit below the boxes rather than over them, and
// why they are a component of their own rather than the first two members of
// `OverlayDecorations`. The layer order in `BoxOverlay` is then readable as
// what it is: anatomy, the interactive layer, everything else.
//
// It owns the grid pattern's id (one `useId` per overlay, so two pages' grids
// cannot collide) and the margin-guide derivation, because both are pure
// functions of what this component already takes.

import { useId } from 'react';
import { marginGuide, type PageMargin } from './marginGuide';
import { MarginGuideShape, OverlayGrid } from './OverlayShapes';

export interface PaperAnatomyProps {
  /** Snap-grid step in pt; `0` or absent paints no grid. */
  readonly grid?: number;
  /** The engine's RESOLVED page margins; `null` paints no guide. */
  readonly margin: PageMargin | null;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

export function PaperAnatomy({ grid = 0, margin, scale, width, height }: PaperAnatomyProps) {
  const patternId = `sj-grid-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const guide = marginGuide(margin, scale, width, height);
  return (
    <>
      {grid > 0 ? (
        <OverlayGrid
          grid={grid}
          scale={scale}
          width={width}
          height={height}
          patternId={patternId}
        />
      ) : null}
      {guide === null ? null : <MarginGuideShape guide={guide} />}
    </>
  );
}
