// Page-size reference data and the pure geometry helpers the page-setup surface
// builds on. The named-size point dimensions duplicate the engine's own table
// (engine/core/src/geometry.rs) so the size thumbnail can draw without a render
// round-trip; that duplication is pinned against the real engine in the wasm
// integration suite (render each named size, assert the page pixel dims), so a
// drift reds `make gui` rather than shipping. The unit constants are physics
// (1in = 72pt, 1mm = 72/25.4pt), not engine grammar — the GUI composes a wire
// length string from a number + unit and never parses one back.

/** The absolute units the custom-size inputs offer. A closed enum — the unit
 * select's value casts to it total, so no free-text unit ever reaches the wire. */
export type SizeUnit = 'mm' | 'cm' | 'in' | 'pt';

export const SIZE_UNITS: readonly SizeUnit[] = ['mm', 'cm', 'in', 'pt'];

/** Points per one unit. `pt` is 1; the physical units are exact conversions. */
const PT_PER_UNIT: Record<SizeUnit, number> = {
  pt: 1,
  in: 72,
  mm: 72 / 25.4,
  cm: 720 / 25.4,
};

/** A named engine page size in portrait orientation (w < h), plus the unit its
 * dimensions are conventionally quoted in (mm for ISO A / JIS B, in for the
 * North-American sizes) — the unit the thumbnail label and the named→custom
 * prefill use. */
export interface NamedSize {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly unit: SizeUnit;
}

// Portrait point dimensions, verbatim from engine/core/src/geometry.rs.
export const PAGE_SIZES: readonly NamedSize[] = [
  { name: 'A3', w: 841.89, h: 1190.55, unit: 'mm' },
  { name: 'A4', w: 595.28, h: 841.89, unit: 'mm' },
  { name: 'A5', w: 419.53, h: 595.28, unit: 'mm' },
  { name: 'B4', w: 728.5, h: 1031.81, unit: 'mm' },
  { name: 'B5', w: 515.91, h: 728.5, unit: 'mm' },
  { name: 'Letter', w: 612, h: 792, unit: 'in' },
  { name: 'Legal', w: 612, h: 1008, unit: 'in' },
  { name: 'Tabloid', w: 792, h: 1224, unit: 'in' },
];

/** The engine size spellings, in the table's order (the "all sizes" group). */
export const PAGE_SIZE_NAMES: readonly string[] = PAGE_SIZES.map((size) => size.name);

/** The `size` select's sentinel value for switching to a custom `{ w, h }`.
 * Engine names are capitalized, so a lowercase sentinel cannot collide. */
export const CUSTOM = 'custom';

/** Point dimensions for a named size, or `undefined` for an unknown spelling. */
export function namedSize(name: string): NamedSize | undefined {
  return PAGE_SIZES.find((size) => size.name === name);
}

/** Convert a length in `unit` to points. */
export function unitToPt(value: number, unit: SizeUnit): number {
  return value * PT_PER_UNIT[unit];
}

// A plain non-negative decimal — no sign, no exponent, no unit — so a matched
// value is safe to concatenate with a unit suffix straight onto the wire.
const NUMERAL = /^\d+(?:\.\d+)?$/;

/** The most a raw dimension string may be before the split even runs — a page
 * dimension is a short numeral, so anything longer is malformed input, not a
 * length. Bounds the regex against a hostile input. */
const MAX_DIM_CHARS = 32;

/** A dimension split into its numeral and optional unit, for SEEDING the custom
 * inputs from an authored wire value (`"8.5in"` → `{ value: '8.5', unit: 'in' }`,
 * a bare `"200"` → `{ value: '200', unit: null }`). Display-only: the writes
 * always recompose from the inputs, so this parse never round-trips. */
export interface DimensionParts {
  readonly value: string;
  readonly unit: SizeUnit | null;
}

/** Split a raw dimension string, or `null` when it is empty, over-long, or not a
 * `<numeral><unit?>` value. Anchored and linear (no backtracking). */
export function splitDimension(raw: string): DimensionParts | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_DIM_CHARS) {
    return null;
  }
  const matched = /^(\d+(?:\.\d+)?)(mm|cm|in|pt)?$/.exec(trimmed);
  if (matched === null) {
    return null;
  }
  return { value: matched[1], unit: (matched[2] as SizeUnit | undefined) ?? null };
}

/** Format a point length in `unit` as a clean numeral string (up to two
 * decimals, trailing zeros trimmed) — the seed value for a custom input and the
 * numeral in a thumbnail label. Always matches {@link NUMERAL}. */
export function formatDimension(pt: number, unit: SizeUnit): string {
  const value = pt / PT_PER_UNIT[unit];
  const fixed = value.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
}

/** Compose a wire length string from a raw input numeral + unit, or `null` when
 * the input is not a positive plain decimal (empty, signed, exponential, or
 * non-numeric). The unit is a closed enum, and the numeral is validated before
 * concatenation, so the result is always a length the engine parses. */
export function composeDimension(value: string, unit: SizeUnit): string | null {
  const trimmed = value.trim();
  if (!NUMERAL.test(trimmed) || Number(trimmed) <= 0) {
    return null;
  }
  return `${trimmed}${unit}`;
}

/** Reinterpret a raw input numeral from one unit to another, preserving the
 * physical length (the unit-select conversion). `null` on the same invalid
 * inputs as {@link composeDimension}. */
export function convertDimension(value: string, from: SizeUnit, to: SizeUnit): string | null {
  const trimmed = value.trim();
  if (!NUMERAL.test(trimmed) || Number(trimmed) <= 0) {
    return null;
  }
  return formatDimension(unitToPt(Number(trimmed), from), to);
}

/** Longest side of the size thumbnail, in px. */
const THUMB_MAX = 120;

// A neutral portrait aspect (ISO A ratio, 1:√2) for when the dimensions are
// unknown or hostile — the thumbnail still draws a sensible page outline.
const FALLBACK_ASPECT = 1 / Math.SQRT2;

/** The proportional outline rectangle for the thumbnail: the longer side is
 * {@link THUMB_MAX}, the shorter scaled to match. Non-finite / non-positive /
 * degenerate dimensions fall back to a neutral portrait outline, and every
 * returned side is a finite integer ≥ 1 (a safe SVG attribute). */
export function thumbnailGeometry(
  w: number,
  h: number,
  max: number = THUMB_MAX,
): { readonly width: number; readonly height: number } {
  const ok = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  if (!ok) {
    return { width: Math.max(1, Math.round(max * FALLBACK_ASPECT)), height: max };
  }
  return w >= h
    ? { width: max, height: Math.max(1, Math.round((max * h) / w)) }
    : { width: Math.max(1, Math.round((max * w) / h)), height: max };
}
