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
 * chrome. `undefined` for anything that is not a colour — the unset chip keeps its
 * token border, which is painted in a token and so already follows the theme. The
 * guard is here rather than at the call sites so the function is total over the
 * hostile strings a document can carry. */
export function chipRing(value: string): string | undefined {
  if (!isHexColor(value)) {
    return undefined;
  }
  return relativeLuminance(value) > LIGHT_CHIP_LUMINANCE ? DARK_RING : LIGHT_RING;
}
