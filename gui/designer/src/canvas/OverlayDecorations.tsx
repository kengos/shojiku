// Everything the overlay paints OVER the interactive layer: the drag's own
// marks (ghost, alignment guides, drop indicators, rubber band), the selection's
// group frame, the link badges, and the container marks. None of them is
// clickable — they annotate what the layer underneath owns.
//
// It exists so `BoxOverlay` can say what its header claims it is: the `<svg>`,
// one `useOverlayDrag` call, and the LAYER ORDER. That order used to be eight
// JSX expressions with the interactive layer somewhere in the middle of them;
// now it is three children, and where a new decoration goes is a question with
// an obvious answer. A wrapper that only moved lines would not be worth having
// — this one moves the DECISION.
//
// Inputs arrive as the three bundles they already come in — the drag machine's
// own return value, the pure layer derivation, and what the HOST passes through
// — rather than as fifteen loose props.

import type { BoxRect, PlacedBox } from '../engine/types';
import { type ContainerMark, ContainerMarkVisual } from './ContainerMarkVisual';
import type { IndicatorLine } from './dropPlan';
import { LinkHintShape } from './LinkHintShape';
import { type LinkHint, linkHintChip } from './linkHint';
import { DropIndicators } from './OverlayDropShapes';
import { GhostRect, GuideLines, MarqueeRect } from './OverlayGestureShapes';
import { GroupFrame, LinkBadgeLayer } from './OverlayShapes';
import type { OverlayLayers } from './overlayLayers';
import type { OverlayDrag } from './useOverlayDrag';

/** What the HOST passes through to the decorations: the palette drag's two
 * mutually-exclusive insertion indicators, the container marks, and the
 * localized drop warning. Kept as one bundle because they share an origin —
 * none of them is derived here. */
export interface ExternalDecorations {
  readonly insertLine: IndicatorLine | null;
  readonly insertRects: readonly BoxRect[];
  readonly containerMarks: readonly ContainerMark[];
  readonly dropWarning?: string;
  /** What the host says about each LINKED item. Absent = the badge keeps
   * saying only THAT a link exists, which is where this canvas started. */
  readonly linkHints?: ReadonlyMap<string, LinkHint>;
}

export interface OverlayDecorationsProps {
  /** The live drag machine's paint — `useOverlayDrag`'s own return value. */
  readonly paint: OverlayDrag;
  /** The pure per-render derivation — `overlayLayers`'s own return value. */
  readonly layers: OverlayLayers;
  readonly external: ExternalDecorations;
  readonly boxes: readonly PlacedBox[];
  readonly scale: number;
  /** The PLACEMENT a pointer or focus is on, or null. */
  readonly hovered: PlacedBox | null;
  /** The page in overlay px — the destination chip is clamped inside it. */
  readonly page: { readonly width: number; readonly height: number };
}

export function OverlayDecorations({
  paint,
  layers,
  external,
  boxes,
  scale,
  hovered,
  page,
}: OverlayDecorationsProps) {
  const hint = linkHintChip(hovered, external.linkHints, scale, page);
  return (
    <>
      {paint.ghostPx === null ? null : <GhostRect rect={paint.ghostPx} />}
      <GuideLines guides={paint.guides} scale={scale} />
      <DropIndicators
        region={paint.region}
        // The reorder indicator and an external (palette-drop) one share the
        // rendering; at most one exists at a time.
        line={paint.indicator ?? external.insertLine}
        insertRects={external.insertRects}
        warning={paint.clearsPosition ? external.dropWarning : undefined}
        ghost={paint.ghostPx}
        scale={scale}
      />
      <LinkBadgeLayer badges={layers.linkBadges} />
      {hint === null ? null : <LinkHintShape chip={hint} />}
      {layers.groupBox === null ? null : <GroupFrame rect={layers.groupBox} />}
      {paint.marqueePx === null ? null : <MarqueeRect rect={paint.marqueePx} />}
      {external.containerMarks.map((mark) => (
        <ContainerMarkVisual key={mark.path} mark={mark} boxes={boxes} scale={scale} />
      ))}
    </>
  );
}
