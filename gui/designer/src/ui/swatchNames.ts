// What a curated swatch is CALLED. A swatch button carries no visible text, so
// its `aria-label` is its whole accessible name — and a raw `#b91c1c` is not a
// name a screen-reader user can act on. This maps each palette entry to a
// chrome key naming the colour; anything outside the palette (the native custom
// picker's value, a document-derived colour) keeps its hex, which is the only
// honest thing to say about an arbitrary value.
//
// A real `Map`, never a plain-object table: the lookup key is a string that can
// reach here from a document, so `constructor` / `__proto__` must MISS rather
// than walk the prototype to an inherited value.

/** Palette hex → the chrome key naming that colour. Keyed to the `SWATCHES`
 * list in `ColorSwatchPicker` (a unit test pins the two against each other). */
const SWATCH_NAME_KEYS: ReadonlyMap<string, string> = new Map([
  ['#000000', 'color.black'],
  ['#374151', 'color.grayDark'],
  ['#6b7280', 'color.gray'],
  ['#9ca3af', 'color.grayLight'],
  ['#d1d5db', 'color.grayPale'],
  ['#ffffff', 'color.white'],
  ['#b91c1c', 'color.red'],
  ['#c2410c', 'color.orange'],
  ['#b45309', 'color.amber'],
  ['#15803d', 'color.green'],
  ['#1d4ed8', 'color.blue'],
  ['#6d28d9', 'color.purple'],
]);

/** The accessible name for a colour value: the localized palette name when the
 * value is one of the curated swatches, else the value itself. */
export function swatchName(value: string, t: (key: string) => string): string {
  const key = SWATCH_NAME_KEYS.get(value);
  return key === undefined ? value : t(key);
}

/** The palette entries this module names — the drift guard reads it. */
export function namedSwatches(): readonly string[] {
  return [...SWATCH_NAME_KEYS.keys()];
}
