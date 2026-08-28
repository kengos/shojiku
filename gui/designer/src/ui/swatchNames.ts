// What a curated swatch is CALLED, and the reason it is called anything at all: a
// swatch button carries no visible text, so a raw `#b91c1c` is not a name anyone can
// act on — not a screen-reader user, and not a sighted reader who cannot tell the
// swatch apart from its neighbour. The name is shown as well as announced (the grid's
// readout line), so this is the one place both channels are served from.
//
// The name is DERIVED from where the swatch sits (`swatchPalette`), not looked up per
// colour: a hue column plus a darkness step. That is what lets a 36-swatch grid cost
// one chrome key instead of thirty-six, and it means a name can never drift out of
// agreement with the position the grid renders it at. Anything outside the palette
// keeps its hex, which is the only honest thing to say about an arbitrary value.

import type { I18n } from '../i18n/context';
import { SHADE_STEPS, swatchPlace } from './swatchPalette';

/** The localized name for a colour value: a palette colour's derived name, else the
 * value itself. The step reaches the catalog as an ARG rather than being pasted on,
 * so a locale orders the words however it reads best. */
export function swatchName(value: string, t: I18n['t']): string {
  const place = swatchPlace(value);
  if (place === undefined) {
    return value;
  }
  const hue = t(place.nameKey);
  if (place.step === undefined) {
    return hue;
  }
  // `of` travels as an arg rather than being written into each locale's string, so
  // the scale is stated in one place and a locale cannot fall out of step with it.
  return t('color.shade', { color: hue, step: place.step, of: SHADE_STEPS });
}
