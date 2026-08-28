// The accessible name a colour swatch answers to, derived the same way the picker
// derives it. Test substrate only — excluded from coverage.
//
// A suite that clicks "the red swatch" cares that picking it commits `#b91c1c`, not
// what the chrome calls it. Spelling the name as a literal at each call site ties
// fourteen unrelated suites to one catalog string: the swatch names are derived from
// a hue key plus a darkness step, so any wording change to either — including the
// copy pass this palette is still awaiting — breaks all of them at once, in a way
// that reads as fourteen broken features rather than one renamed string.

import { DEFAULT_CATALOG } from '../i18n/catalog';
import { translate } from '../i18n/render';
import { swatchName } from '../ui/swatchNames';

/** The `aria-label` the swatch for `hex` carries under the English catalog. Pass it
 * straight to `getByRole('menuitem', { name: … })`. */
export function swatchLabel(hex: string): string {
  return swatchName(hex, (key, args) => translate(DEFAULT_CATALOG, ['en'], key, 'en', args));
}
