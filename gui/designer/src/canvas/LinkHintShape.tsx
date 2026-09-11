// The destination chip: what the link badge could not say on its own.
//
// FIXED ink, like every other mark on the page (gui/STYLE.md § Ink on the
// paper, gated by `canvas/paperInkConvention.test.ts`) — it is drawn on the
// engine-rendered paper, which is white in both colour schemes, so a
// chrome-toned card would be a dark slab on the page in the dark scheme. The
// same neutral the badge uses, on the same near-white ground the drop warning
// uses, so the three chips on this canvas read as one family.
//
// Inert, like the badge it explains: a chip that took pointer events would
// steal them from the item the hover is ABOUT, and the hover would flicker as
// the pointer crossed it.

import { HINT_FONT_PX, HINT_HEIGHT_PX, hintTextOrigin, type LinkHintChip } from './linkHint';

export function LinkHintShape({ chip }: { readonly chip: LinkHintChip }) {
  const text = hintTextOrigin(chip);
  return (
    <g className="sj-link-hint" style={{ pointerEvents: 'none' }}>
      <rect
        className="sj-link-hint-card"
        x={chip.x}
        y={chip.y}
        width={chip.width}
        height={HINT_HEIGHT_PX}
        rx={4}
        fill="#ffffff"
        stroke="#1f1a17"
        strokeOpacity={0.55}
      />
      <text
        className="sj-link-hint-text"
        x={text.x}
        y={text.y}
        fontSize={HINT_FONT_PX}
        fill="#1f1a17"
      >
        {chip.text}
      </text>
    </g>
  );
}
