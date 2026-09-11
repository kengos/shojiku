// The ONE WCAG contrast ratio the Designer's suites measure with. Three of them
// need it — `theme/tokens` (every rendered foreground/background pairing clears
// AA), `ui/chipContrast` (the rings an unset chip draws stay visible on both
// surfaces) and `canvas/paperInkConvention` (which chrome tokens may paint on
// the white page) — and each had written its own copy.
//
// It lives in `testkit/` rather than in `ui/chipContrast.ts` because nothing in
// production compares two colours: `chipRing` measures ONE luminance against a
// threshold. Putting the ratio in the module would also let the module under
// test define the oracle that checks it.
//
// The linearization is NOT re-derived here. `relativeLuminance` is the
// product's own, pinned in `ui/chipContrast.test.ts` against WCAG's reference
// points (`#000000` → 0, `#ffffff` → 1, and `#050505` through the 0.03928
// kink). A second copy written from the same formula by the same hand fails the
// same way, so it would buy the LOOK of an independent oracle and not the
// substance.

import { isHexColor, relativeLuminance } from '../ui/chipContrast';

/** WCAG 2.x contrast ratio between two `#rrggbb` values: 1 for a colour against
 * itself, 21 for black against white. Order does not matter.
 *
 * THROWS on anything that is not a 6-digit hex colour, because every caller is
 * asserting a threshold: a silent `NaN` would read as "this pairing is fine" in
 * a filter and as a confusing failure in an expectation. */
export function contrast(a: string, b: string): number {
  for (const value of [a, b]) {
    if (!isHexColor(value)) {
      throw new Error(`contrast() takes #rrggbb colours, got ${JSON.stringify(value)}`);
    }
  }
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
