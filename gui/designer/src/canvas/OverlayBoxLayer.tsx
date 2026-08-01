// The overlay's INTERACTIVE layer — everything on the overlay you can click or
// focus: one `OverlayBox` per laid-out box, then the resize handles on the
// selected movable one. (Its counterpart, everything that only paints, is the
// grid + `OverlayShapes`/`OverlayGestureShapes` stack the assembly draws around
// this layer.) It owns the paint order (already depth-sorted by
// `overlayLayers`, shallowest-first) and the stable keying rule, which is why
// the assembly hands it two named bundles instead of scattering a dozen values
// through its JSX.

import type { RefObject } from 'react';
import type { PlacedBox } from '../engine/types';
import { OverlayBox } from './OverlayBox';
import { OverlayHandles } from './OverlayHandles';
import type { CanvasManipulate, DragTask } from './overlayDragModel';
import type { OverlayBoxSelection } from './overlayLayers';
import type { UseDrag } from './useDrag';

/** What a box needs to ACT: the manipulation wiring, the drag machine, and the
 * host callbacks a gesture reports through. */
export interface OverlayBoxWiring {
  readonly manipulate: CanvasManipulate | undefined;
  readonly drag: UseDrag<DragTask>;
  readonly onSelect: (path: string) => void;
  readonly onMultiToggle: ((path: string) => void) | undefined;
  readonly onEditRequest: ((path: string) => void) | undefined;
  readonly onContextMenu: ((path: string, x: number, y: number) => void) | undefined;
  /** The overlay-wide "already revealed" marker, so the scroll-into-view runs
   * once per SELECTION rather than once per render of the selected box. */
  readonly scrolledTo: RefObject<string | null>;
}

export interface OverlayBoxLayerProps {
  /** Already in paint order (`overlayLayers.ordered`). */
  readonly boxes: readonly PlacedBox[];
  readonly scale: number;
  readonly selection: OverlayBoxSelection;
  readonly wiring: OverlayBoxWiring;
}

export function OverlayBoxLayer({ boxes, scale, selection, wiring }: OverlayBoxLayerProps) {
  const { selectedPath, selectedRect } = selection;
  const { manipulate, drag } = wiring;
  return (
    <>
      {boxes.map((box, index) => (
        <OverlayBox
          // Keyed by position + path: the box list is regenerated wholesale
          // from each inspect snapshot (never reordered incrementally), and
          // `path` alone can collide — repeat elements share it, and
          // degenerate placements can even share an origin.
          // biome-ignore lint/suspicious/noArrayIndexKey: the box list is regenerated wholesale per snapshot, never reordered incrementally.
          key={`${index}:${box.path}`}
          box={box}
          scale={scale}
          selected={box.path === selectedPath}
          marked={selection.markedPaths.has(box.path)}
          inMultiSelection={selection.multiSelected.has(box.path)}
          dragging={box.path === selection.dragPath}
          selectedAbility={selection.selectedAbility}
          manipulate={manipulate}
          drag={drag}
          onSelect={wiring.onSelect}
          onMultiToggle={wiring.onMultiToggle}
          onEditRequest={wiring.onEditRequest}
          onContextMenu={wiring.onContextMenu}
          scrolledTo={wiring.scrolledTo}
        />
      ))}
      {selectedPath !== null && selectedRect !== null && manipulate !== undefined ? (
        <OverlayHandles
          path={selectedPath}
          rect={selectedRect}
          read={manipulate.read}
          drag={drag}
        />
      ) : null}
    </>
  );
}
