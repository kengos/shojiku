// What a colour VALUE is, and the outline a chip painted in it must draw to stay
// visible. A chip carries the document's own colour while the chrome around it is
// light in one scheme and dark in the other, so a fixed token border always loses
// one end of the range: black disappears into the dark surface, and white — or a
// table header's `#ededed` default — disappears into the light one. Office does not
// invert the backing per colour; it always outlines the swatch. This derives that
// outline from the chip's own WCAG relative luminance, so there is no theme branch
// and no new token to keep in sync.
//
// `isHexColor` lives here rather than beside the picker because it is a property of
// the VALUE, and it is the same guard that keeps a hostile document-derived string
// (`url(…)`, `expression(…)`) out of an inline style.
//
// `chipPaint` is what call sites use: a chip that has no colour to measure needs a
// fill and an outline that no luminance rule can supply, and every site that built
// those by hand had to keep two guards in agreement.

/** A strict 6-digit `#rrggbb` guard: a document-derived colour reaches an inline
 * style ONLY through this. */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Luminance above which a chip counts as light and takes the dark ring. Set so the
 * palette's mid greys fall either side of it — `#6b7280` (0.167) takes the light
 * ring, `#9ca3af` (0.364) the dark one — rather than clustering on one side. The
 * crossover for a neutral grey is around `#a0a0a0`; the boundary is pinned by a
 * test either side of it. */
const LIGHT_CHIP_LUMINANCE = 0.35;

const DARK_RING = 'inset 0 0 0 1px rgba(0, 0, 0, 0.45)';
const LIGHT_RING = 'inset 0 0 0 1px rgba(255, 255, 255, 0.55)';

/** One channel of a validated `#rrggbb`, linearized per WCAG 2.x. */
function channel(hex: string, at: number): number {
  const srgb = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a validated `#rrggbb` string, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** The `boxShadow` a chip of this colour draws so it reads against either scheme's
 * chrome. `undefined` for anything that is not a colour — such a chip has no
 * luminance to derive a ring from, so it takes `UNSET_RING` instead (see
 * `chipPaint`). The guard is here rather than at the call sites so the function is
 * total over the hostile strings a document can carry. */
export function chipRing(value: string): string | undefined {
  if (!isHexColor(value)) {
    return undefined;
  }
  return relativeLuminance(value) > LIGHT_CHIP_LUMINANCE ? DARK_RING : LIGHT_RING;
}

// A chip with no colour cannot derive its outline from luminance, and the token
// border it used to rely on does not carry it: on the dark surface (`#2e2b27`) the
// `bg-bg` fill (`#201e1b`) sits at 1.18 contrast and `--sj-border` (`#3b372f`) at
// 1.19, so an unset chip was invisible in dark mode — which is the state EVERY
// colour field starts in, and the state a scalar-or-map wire value reads as. A mid
// grey is the one ring that cannot lose: composited at the alpha below it holds
// 3.19 against the dark surface and 3.32 against the light one — above the 3:1
// WCAG non-text bar on both, with no theme branch. The dark side is the tighter
// of the two, so the margin is ~0.19; the chequerboard is a shape cue and does
// not carry contrast of its own.
const UNSET_RING = 'inset 0 0 0 1px rgba(128, 128, 128, 0.9)';

// …and the fill says WHICH not-a-colour it is. A flat square reads as "some colour
// I cannot make out" — the checkerboard is the cross-tool convention for "no colour
// here at all", so an unset field is distinguishable from a set one without
// perceiving colour. Two offset 45° gradients are the standard construction; the
// 6px tile shows at least one whole square on the smallest chip that renders it.
const UNSET_SQUARE = 'rgba(128, 128, 128, 0.5)';
const UNSET_TILE = `linear-gradient(45deg, ${UNSET_SQUARE} 25%, transparent 25%, transparent 75%, ${UNSET_SQUARE} 75%)`;

/** The inline style a colour chip paints. Every member is optional, so React drops
 * the ones a given value does not set. */
export interface ChipPaint {
  readonly backgroundColor?: string;
  readonly backgroundImage?: string;
  readonly backgroundSize?: string;
  readonly backgroundPosition?: string;
  readonly boxShadow?: string;
}

/** How to paint a chip showing `value`: the colour itself plus its contrast ring, or
 * the unset treatment for anything that is not a colour (an unset field, and the
 * hostile `url(…)`/`expression(…)` a template can carry — neither reaches an inline
 * colour). One call rather than a narrowing plus a ring lookup at each site, so the
 * two guards cannot disagree and leave a chip painted but un-outlined. */
export function chipPaint(value: string): ChipPaint {
  const ring = chipRing(value);
  if (ring === undefined) {
    return {
      backgroundImage: `${UNSET_TILE}, ${UNSET_TILE}`,
      backgroundSize: '6px 6px',
      backgroundPosition: '0 0, 3px 3px',
      boxShadow: UNSET_RING,
    };
  }
  return { backgroundColor: value, boxShadow: ring };
}
