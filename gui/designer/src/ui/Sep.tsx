// The thin group rule shared by every toolbar cluster (gdoc parity: toolbar
// groups are divided by a rule, not by spacing alone).
//
// It is minted HERE and nowhere else, the way `ui/Button.tsx` mints the filled
// accent — four hand-rolled copies had already drifted into two margin
// spellings, and only one of them was `aria-hidden`.
// `ui/chromeConvention.test.ts` holds that line over both packages' non-test
// source, which is the scope its walker reads (a test may still write the
// shape as a string, and one does, as that sweep's positive control).
//
// The convention that goes with it: a GROUP owns its LEADING rule, so a group
// that does not render takes its rule with it and no two rules can end up
// adjacent. The first group in a bar therefore has none.

/** A decorative vertical rule between two toolbar groups. */
export function Sep() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
