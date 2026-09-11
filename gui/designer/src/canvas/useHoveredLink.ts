// Which PLACEMENT the destination chip is for: the box a pointer is over or the
// keyboard has focused, kept canvas-local because the chip is its only reader.
//
// The box, not its path — a `repeat`'s rows share ONE path, so a path cannot
// say which row you are on, and the chip would land beside the first.
//
// GATED on the hints, and that is the whole reason this is not a bare
// `useState` at the call site. Every box on the canvas reports enter and leave;
// without the gate, a document with no links — or a host that passes no hints
// at all — would re-render the entire overlay on every box the pointer crosses,
// on a canvas whose hover paint has always been pure CSS. React bails out on an
// `Object.is`-equal state, so gating here keeps the prop's documented
// "absent = unchanged" true of the render work and not only of the paint.

import { useCallback, useState } from 'react';
import type { PlacedBox } from '../engine/types';
import type { LinkHint } from './linkHint';

export function useHoveredLink(
  hints: ReadonlyMap<string, LinkHint> | undefined,
): readonly [PlacedBox | null, (box: PlacedBox | null) => void] {
  const [hovered, setHovered] = useState<PlacedBox | null>(null);
  const onHover = useCallback(
    (box: PlacedBox | null) =>
      setHovered(box !== null && hints?.has(box.path) === true ? box : null),
    [hints],
  );
  return [hovered, onHover];
}
