// The curated palette, as a STRUCTURE rather than a flat list. A colour picker whose
// only affordance is seeing the colours is unusable for a reader who cannot
// distinguish them, and a flat grid gives such a reader nothing to navigate by. Laid
// out as hue × darkness, position itself carries the information: a column is one
// hue and a row is one darkness step, so "the darkest red" is reachable by counting
// rather than by looking. The grid renders the hue names as column headers and the
// step as a row label, and every swatch's name is derived from that same pair.
//
// The NEUTRAL row is the one exception, and it is worth stating rather than leaving
// for a reader to discover: it shares the hue columns' template, so `#000000` sits
// under the header naming the first hue. Its gutter says so, and each neutral is
// named outright rather than by a step — but "a column is one hue" is not true of
// that row, and a reader who cannot see the colours is exactly who would be misled.
//
// Deriving the names is also what keeps the chrome catalog small: the six hue names
// and six neutral names already exist (they named the old flat palette), so a
// 36-swatch grid adds ONE key — the darkness step — rather than one per swatch.
//
// The previous flat palette is contained in this one exactly: its six neutrals are
// the neutral row, and its six hues are the `BASE_STEP` row. No colour an existing
// template authored disappears from the picker.

/** A hue column: the chrome key naming it, and its shades from lightest to darkest. */
export interface HueColumn {
  readonly nameKey: string;
  readonly shades: readonly string[];
}

/** The darkness step (1-based) whose row carries the colours the flat palette had.
 * Pinned against the old list by a test — it is what makes this palette a superset
 * rather than a replacement. */
export const BASE_STEP = 4;

/** Hue columns, left to right. Shades run lightest (step 1) to darkest (step 5). */
export const HUE_COLUMNS: readonly HueColumn[] = [
  { nameKey: 'color.red', shades: ['#fecaca', '#f87171', '#dc2626', '#b91c1c', '#7f1d1d'] },
  { nameKey: 'color.orange', shades: ['#fed7aa', '#fb923c', '#ea580c', '#c2410c', '#7c2d12'] },
  { nameKey: 'color.amber', shades: ['#fde68a', '#fbbf24', '#d97706', '#b45309', '#78350f'] },
  { nameKey: 'color.green', shades: ['#bbf7d0', '#4ade80', '#16a34a', '#15803d', '#14532d'] },
  { nameKey: 'color.blue', shades: ['#bfdbfe', '#60a5fa', '#2563eb', '#1d4ed8', '#1e3a8a'] },
  { nameKey: 'color.purple', shades: ['#ddd6fe', '#a78bfa', '#7c3aed', '#6d28d9', '#4c1d95'] },
];

/** The achromatic row, darkest to lightest. These carry their own names rather than a
 * step, because "black" and "white" are what a reader calls them — a darkness step
 * would be a worse name, not a cheaper one. */
export const NEUTRALS: readonly HueColumn[] = [
  { nameKey: 'color.black', shades: ['#000000'] },
  { nameKey: 'color.grayDark', shades: ['#374151'] },
  { nameKey: 'color.gray', shades: ['#6b7280'] },
  { nameKey: 'color.grayLight', shades: ['#9ca3af'] },
  { nameKey: 'color.grayPale', shades: ['#d1d5db'] },
  { nameKey: 'color.white', shades: ['#ffffff'] },
];

/** How many darkness steps every hue column carries. */
export const SHADE_STEPS = 5;

/** Every swatch in the palette, in no particular order — the drift guard and the
 * containment test read it. */
export function paletteSwatches(): readonly string[] {
  return [
    ...NEUTRALS.flatMap((column) => column.shades),
    ...HUE_COLUMNS.flatMap((column) => column.shades),
  ];
}

/** Where a swatch sits, or `undefined` for a value the palette does not carry (a
 * custom colour, or a colour a document authored by hand). */
export interface SwatchPlace {
  readonly nameKey: string;
  /** 1-based darkness step, or `undefined` for a neutral, which is named outright. */
  readonly step?: number;
}

/** Locate a colour in the palette. A `Map` rather than a lookup over a plain object:
 * the key is a string that can reach here from a document, so `constructor` and
 * `__proto__` must MISS rather than walk the prototype chain to an inherited value. */
const PLACES: ReadonlyMap<string, SwatchPlace> = new Map([
  ...NEUTRALS.map(
    (column) =>
      [column.shades[0], { nameKey: column.nameKey }] as const satisfies readonly [
        string,
        SwatchPlace,
      ],
  ),
  ...HUE_COLUMNS.flatMap((column) =>
    column.shades.map(
      (hex, index) =>
        [hex, { nameKey: column.nameKey, step: index + 1 }] as const satisfies readonly [
          string,
          SwatchPlace,
        ],
    ),
  ),
]);

/** Where this colour sits in the palette, if it is one of ours. */
export function swatchPlace(value: string): SwatchPlace | undefined {
  return PLACES.get(value);
}
