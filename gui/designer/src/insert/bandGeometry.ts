// How tall the margin box is, for placing a freshly inserted band item.
//
// The render is the first source: it reports what the engine ACTUALLY laid out.
// But a band can now be created on a document that has never rendered — the
// whole point of the create affordance is that it works on a blank start — and
// the render-derived reader answers a flat 792 in that window. That number is
// A4-at-margin-25 exactly, and every blank preset is margin 25, so it is right
// by coincidence on the five A4 presets and 50pt too large on the two Letter
// ones: a footer item placed against it lands past the bottom of the margin box
// and its line box runs off the sheet, where it renders silently and invisibly.
//
// So the DOCUMENT is the second source. It states its own page size, its
// orientation and its margins, and `readPageView` already resolves the first
// two into oriented points — no render needed, and exact rather than guessed.
// When neither source can answer, this says so (`null`) rather than inventing a
// number, and `bandInsertY` degrades to the top of the box.

import type { ReadFn } from '@shojiku/designer-core';
import { contentHeightPt } from '../hooks/geometry';
import { readMarginView } from '../panel/marginModel';
import { readPageView } from '../panel/pageSetupModel';
import type { LastGoodPreview } from '../preview/reducer';

/** One margin side in pt, or `null` when it is not exactly resolvable — a
 * percentage resolves against a dimension this module deliberately does not
 * re-derive, and a garbage value is not a length at all. */
function sidePt(raw: string): number | null {
  const bare = Number(raw);
  if (Number.isFinite(bare)) {
    return bare;
  }
  const match = /^(\d+(?:\.\d+)?)(mm|cm|in|pt)$/.exec(raw);
  if (match === null) {
    return null;
  }
  const value = Number(match[1]);
  const unit = match[2];
  const perInch = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1 } as const;
  return value * perInch[unit as keyof typeof perInch];
}

/** The margin box height the DOCUMENT declares, in pt. `null` when the page
 * size or either vertical margin cannot be resolved exactly. */
export function documentContentHeightPt(read: ReadFn): number | null {
  const pageRaw = read('page');
  const dims = readPageView(pageRaw).dims;
  if (dims === null || !Number.isFinite(dims.h)) {
    return null;
  }
  const sides = readMarginView(pageRaw).sides;
  const top = sidePt(sides.top);
  const bottom = sidePt(sides.bottom);
  if (top === null || bottom === null) {
    return null;
  }
  const height = dims.h - top - bottom;
  return height > 0 ? height : null;
}

/** The margin box height a band insert should place against: the render when
 * there is one, the document otherwise, and `NaN` when neither can say — which
 * `bandInsertY` already reads as "unknown" and answers with the top of the box,
 * rather than a coordinate that could land off the sheet. */
export function bandBoxHeightPt(preview: LastGoodPreview | null, read: ReadFn): number {
  if (preview !== null && preview.pages[0] !== undefined) {
    return contentHeightPt(preview);
  }
  return documentContentHeightPt(read) ?? Number.NaN;
}
