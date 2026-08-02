// What the selection overlay PAINTS, derived once from the current props: the
// box paint order, which paths a container mark already outlines, the primary
// selection's ability and its rect, and the multi-selection's union box.
//
// Pure and built in ONE pass over a context bundle, so the overlay assembly
// reads a named result instead of threading five separate derivations through
// its JSX — and so every derivation is unit-testable without a rendered tree.
// A selection the current box list does not contain degrades to a null rect
// (paths are re-synthesized each layout, so a stale one is ordinary).

import type { BoxRect, PlacedBox } from '../engine/types';
import type { ContainerMark } from './ContainerMarkVisual';
import { scaleRect } from './geometry';
import { type Manipulation, manipulationFor } from './manipulate';
import type { CanvasManipulate } from './overlayDragModel';
import { byDepth, groupBounds } from './overlayGeometry';

export interface OverlayLayersInput {
  readonly boxes: readonly PlacedBox[];
  /** Device pixels per pt — the same scale the page was rasterized at. */
  readonly scale: number;
  readonly selectedPath: string | null;
  readonly multiSelected: ReadonlySet<string>;
  /** The path being dragged — null when idle. */
  readonly dragPath: string | null;
  /** Absent = the overlay is select-only, so nothing is movable. */
  readonly manipulate: CanvasManipulate | undefined;
  readonly containerMarks: readonly ContainerMark[];
}

/** The selection state the interactive layer reads every box out of. */
export interface OverlayBoxSelection {
  readonly selectedPath: string | null;
  readonly multiSelected: ReadonlySet<string>;
  readonly dragPath: string | null;
  /** Paths a container mark already outlines — their plain selection strokes
   * are suppressed (double-stroking reads as clutter). */
  readonly markedPaths: ReadonlySet<string>;
  /** The primary selection's ability; drives its cursor and the handles. */
  readonly selectedAbility: Manipulation | null;
  /** The primary selection's rect in overlay px — non-null only when it is
   * MOVABLE (that is what the resize handles attach to). */
  readonly selectedRect: BoxRect | null;
}

export interface OverlayLayers {
  /** Paint order: shallowest-first, so a container/table fragment never masks
   * its own cells and the innermost box is picked first. */
  readonly ordered: readonly PlacedBox[];
  readonly selection: OverlayBoxSelection;
  /** The multi-selection's union frame, or null below two distinct paths. */
  readonly groupBox: BoxRect | null;
}

export function overlayLayers({
  boxes,
  scale,
  selectedPath,
  multiSelected,
  dragPath,
  manipulate,
  containerMarks,
}: OverlayLayersInput): OverlayLayers {
  const selectedAbility =
    selectedPath !== null && manipulate !== undefined
      ? manipulationFor(manipulate.read, selectedPath)
      : null;
  const movable = selectedAbility?.kind === 'move';
  const selectedBox = movable ? (boxes.find((box) => box.path === selectedPath) ?? null) : null;
  return {
    ordered: byDepth(boxes),
    selection: {
      selectedPath,
      multiSelected,
      dragPath,
      markedPaths: new Set(containerMarks.map((mark) => mark.path)),
      selectedAbility,
      selectedRect: selectedBox === null ? null : scaleRect(selectedBox.border, scale),
    },
    groupBox: groupBounds(boxes, multiSelected, selectedPath, movable, scale),
  };
}
