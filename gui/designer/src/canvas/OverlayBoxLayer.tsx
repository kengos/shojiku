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
import type { LinkHint } from './linkHint';
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
  /** What the host says about each LINKED item — the destination the hover chip
   * shows, and the accessible description the box carries whether or not
   * anything is hovered, because a screen reader never hovers. */
  readonly linkHints: ReadonlyMap<string, LinkHint> | undefined;
  /** Pointer or focus arrived on a box, or left it (`null`) — the PLACEMENT,
   * since a `repeat`'s rows share one path. Canvas-local state `BoxOverlay`
   * always owns, not host-optional like its neighbours. */
  readonly onHover: (box: PlacedBox | null) => void;
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
          // Gated on the ENGINE's flag as well as on the map, so a host that
          // names a path the engine never stamped gets neither channel rather
          // than a description for a badge that is not drawn. The in-repo host
          // derives the map from the flag; `linkHints` is a public prop, so
          // this side does not assume it.
          hint={box.linked === true ? wiring.linkHints?.get(box.path) : undefined}
          onHover={wiring.onHover}
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
