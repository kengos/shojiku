// The container mark: the dashed outline the canvas draws on a selected (or
// hover-highlighted) container, its direct children's slot guides, and a kind
// chip naming what the container is. Purely decorative — never hit-testable,
// and nothing for a screen reader beyond the property panel's own labels.

import type { PlacedBox } from '../engine/types';
import { scaleRect } from './geometry';

/** Container-chip geometry in overlay px (decorative, like the handles). */
const CHIP_HEIGHT_PX = 16;
const CHIP_FONT_PX = 10;
const CHIP_PAD_PX = 6;

/** A container mark the Designer computes: the selected container and/or the
 * parent-card hover target — dashed outline + slot guides + a kind chip. */
export interface ContainerMark {
  readonly path: string;
  /** The localized chip text, e.g. the localized container-row chip. */
  readonly label: string;
}

/** Whether `path` addresses a DIRECT child of the container at `parent`
 * (`<parent>.items[<n>]`, nothing deeper) — the slot-guide filter. String
 * ops only: paths carry `[`/`]`, so a RegExp over them would need escaping. */
function isDirectChild(parent: string, path: string): boolean {
  const prefix = `${parent}.items[`;
  if (!path.startsWith(prefix)) {
    return false;
  }
  const rest = path.slice(prefix.length);
  const close = rest.indexOf(']');
  return close > 0 && close + 1 === rest.length && /^\d+$/.test(rest.slice(0, close));
}

/** Approximate chip width for its label — decorative sizing only (SVG text
 * has no auto-sized background). CJK glyphs run ~1em, everything else ~0.55em;
 * `charCodeAt` is total on the non-empty chars a string iterator yields (a
 * surrogate half also reads as wide, which only over-sizes the padding). */
function chipWidth(label: string): number {
  let width = 0;
  for (const ch of label) {
    width += ch.charCodeAt(0) >= 0x2e80 ? CHIP_FONT_PX : CHIP_FONT_PX * 0.55;
  }
  return Math.ceil(width) + CHIP_PAD_PX * 2;
}

/** One container mark's visuals: the dashed outline on every box carrying the
 * mark's path (repeat fragments share paths), dashed slot guides on its direct
 * children, and the kind chip at the first box's top-left (clamped inside the
 * page when the container sits at the top edge). Decorative only — never
 * hit-testable, nothing for a screen reader beyond the panel's own labels. */
export function ContainerMarkVisual({
  mark,
  boxes,
  scale,
}: {
  readonly mark: ContainerMark;
  readonly boxes: readonly PlacedBox[];
  readonly scale: number;
}) {
  const hits = boxes.filter((box) => box.path === mark.path);
  if (hits.length === 0) {
    return null;
  }
  const slots = boxes.filter((box) => isDirectChild(mark.path, box.path));
  const first = scaleRect(hits[0].border, scale);
  const chipY = first.y >= CHIP_HEIGHT_PX + 2 ? first.y - CHIP_HEIGHT_PX - 2 : first.y;
  return (
    <g className="sj-container-mark" style={{ pointerEvents: 'none' }}>
      {hits.map((box, index) => {
        const r = scaleRect(box.border, scale);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: repeat fragments share one path; the list is regenerated wholesale per snapshot.
            key={`${index}:${box.path}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="none"
            stroke="#c2402a"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        );
      })}
      {slots.map((box, index) => {
        const r = scaleRect(box.border, scale);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: repeat fragments share one path; the list is regenerated wholesale per snapshot.
            key={`${index}:${box.path}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill="none"
            stroke="#c2402a"
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}
      <rect
        className="sj-container-chip"
        x={first.x}
        y={chipY}
        width={chipWidth(mark.label)}
        height={CHIP_HEIGHT_PX}
        rx={3}
        fill="#c2402a"
      />
      <text
        x={first.x + CHIP_PAD_PX}
        y={chipY + CHIP_HEIGHT_PX - 4.5}
        fontSize={CHIP_FONT_PX}
        fill="#ffffff"
      >
        {mark.label}
      </text>
    </g>
  );
}
