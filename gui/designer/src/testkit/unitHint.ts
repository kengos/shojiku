// The unit-affordance assertion helper, shared by the per-site suites. Its own
// module rather than a corner of `fixtures.ts`: it is an ASSERTION over a
// rendered field, not a fixture, and the two have nothing to do with each
// other. Test substrate only — excluded from coverage.
import { screen } from '@testing-library/react';
/** The unit affordance's bubble text, in `en` — the ONE copy the per-surface
 * assertions share, so a wording change moves in one place.
 *
 * Every panel field whose key is a wire `Length` carries it while the implicit
 * `pt` is on screen; the border pen's width is a `number (pt)` and must NOT,
 * which is asserted by absence at that one site.
 *
 * Deliberately TERSE. Measured in the real app: a centred `TipBubble` on a
 * left-column panel field has 123px before the panel column clips it, and the
 * sentence this replaced needed 325px — it was the only truncating tooltip in
 * the Designer. The bubble sits beside the `pt` badge, so it only has to name
 * alternatives; `em`, `rem`, `%` and the caveats live in the glossary's
 * `units` term, which has room for them. */
export const UNIT_HINT_EN = 'mm, cm, in too';

/** The unit-hint bubbles inside the field labeled `label` (the bubble is
 * `aria-hidden`, so it is found by its test hook rather than by role).
 *
 * SCOPED to one field on purpose: a property panel renders many length fields,
 * so a page-wide query passes on a NEIGHBOUR's hint and proves nothing about
 * the site under test — which is the whole point of asserting per site. */
export function unitHintsFor(label: string): readonly Element[] {
  const field = screen.getByLabelText(label).closest('span.mb-2');
  if (field === null) {
    throw new Error(`no field wrapper around the input labeled ${label}`);
  }
  return [...field.querySelectorAll('[data-sj-tip]')].filter(
    (el) => el.textContent === UNIT_HINT_EN,
  );
}
