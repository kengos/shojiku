// What the page setup IS, and how it READS: the display view derived from the
// materialized `page:` map (`Editor.read('page')`), plus the human size label the
// thumbnail captions itself with. Framework-free so the size/orientation/custom
// logic is exhaustively unit-testable; the component stays thin over it.
//
// The other half — what an EDIT WRITES — is `pageSetupOps.ts`: every control's
// named `designer-core` op (AI parity, the panel never mutates the document).
// The seam is the same one the styles registry uses: what the surface reads is
// refused by nothing, while an op builder can decline (a null / empty batch).

import {
  CUSTOM,
  type DimensionParts,
  formatDimension,
  namedSize,
  type SizeUnit,
  splitDimension,
  unitToPt,
} from './pageSizes';

export type Orientation = 'portrait' | 'landscape';

/** The custom-size input values: the two numerals (as typed) sharing one unit. */
export interface CustomDims {
  readonly w: string;
  readonly h: string;
  readonly unit: SizeUnit;
}

interface Dims {
  readonly w: number;
  readonly h: number;
}

/** The page-setup display view. `dims` is the oriented point size the thumbnail
 * draws (null when unknown — an unrecognized named size or unparseable custom).
 * `hasSizeKey`/`hasOrientation` drive the switch ops (a removeKey must not run
 * on an absent key). */
export type PageView =
  | {
      readonly mode: 'named';
      readonly sizeName: string;
      readonly orientation: Orientation;
      readonly hasSizeKey: boolean;
      readonly hasOrientation: boolean;
      readonly dims: Dims | null;
    }
  | {
      readonly mode: 'custom';
      readonly sizeName: typeof CUSTOM;
      readonly orientation: Orientation;
      readonly hasSizeKey: boolean;
      readonly hasOrientation: boolean;
      readonly custom: CustomDims;
      readonly dims: Dims | null;
    };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** A wire dimension as text: a unit string verbatim, a bare number stringified,
 * anything else empty. */
function dimText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  return typeof raw === 'number' ? String(raw) : '';
}

/** The point value of a wire dimension (`"8.5in"`, a bare pt number), or null
 * when it is missing or unparseable. A bare/unit-less numeral is points. */
function dimToPt(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  const parts = splitDimension(dimText(raw));
  if (parts === null) {
    return null;
  }
  const value = Number(parts.value);
  return value > 0 ? unitToPt(value, parts.unit ?? 'pt') : null;
}

/** One seed numeral, re-expressed in the shared display unit when the wire
 * value carries a different one. The inputs commit-on-blur and the unit select
 * converts FROM the displayed unit, so a numeral shown under the wrong unit
 * would rewrite the physical size on a mere tab-through — a mixed-unit
 * authored `{ w: 8.5in, h: 200mm }` (or a bare-pt dimension beside a suffixed
 * one) must display as its physical length in the shared unit. */
function seedValue(parts: DimensionParts | null, unit: SizeUnit): string {
  if (parts === null) {
    return '';
  }
  const own = parts.unit ?? 'pt';
  return own === unit ? parts.value : formatDimension(unitToPt(Number(parts.value), own), unit);
}

/** Seed the custom inputs from the wire `{ w, h }` — the shared unit is the
 * first dimension's suffix (or `pt` for bare numbers), and both numerals are
 * expressed in it. */
function customSeed(sizeMap: Record<string, unknown>): CustomDims {
  const w = splitDimension(dimText(sizeMap.w));
  const h = splitDimension(dimText(sizeMap.h));
  const unit = w?.unit ?? h?.unit ?? 'pt';
  return {
    w: seedValue(w, unit),
    h: seedValue(h, unit),
    unit,
  };
}

/** Read the page-setup view from a materialized `page:` node (or `undefined`
 * when the template has no `page:` key — treated as the default A4 portrait). */
export function readPageView(raw: unknown): PageView {
  const page = record(raw);
  const sizeRaw = page?.size;
  const hasSizeKey = sizeRaw !== undefined;
  const hasOrientation = page?.orientation !== undefined;
  const sizeMap = record(sizeRaw);
  if (sizeMap !== undefined) {
    const w = dimToPt(sizeMap.w);
    const h = dimToPt(sizeMap.h);
    const dims = w !== null && h !== null ? { w, h } : null;
    return {
      mode: 'custom',
      sizeName: CUSTOM,
      orientation: dims !== null && dims.w >= dims.h ? 'landscape' : 'portrait',
      hasSizeKey,
      hasOrientation,
      custom: customSeed(sizeMap),
      dims,
    };
  }
  const orientation: Orientation = page?.orientation === 'landscape' ? 'landscape' : 'portrait';
  const name = typeof sizeRaw === 'string' ? sizeRaw : 'A4';
  const base = namedSize(name);
  const dims =
    base === undefined
      ? null
      : orientation === 'landscape'
        ? { w: base.h, h: base.w }
        : { w: base.w, h: base.h };
  return { mode: 'named', sizeName: name, orientation, hasSizeKey, hasOrientation, dims };
}

/** The page a render was made at, as one phrase: the size's own name plus its
 * real dimensions (`A4 — 210 × 297 mm`), or the dimensions alone for a custom
 * size, which has no name to give.
 *
 * `null` when this build cannot describe the page — an unrecognized `page.size`
 * spelling, or a custom size whose dimensions do not parse. A surface that
 * exists to REASSURE must then say nothing rather than name a page it is
 * guessing at. */
export function pageSummary(view: PageView): string | null {
  if (view.dims === null) {
    return null;
  }
  return view.mode === 'custom' ? sizeLabel(view) : `${view.sizeName} — ${sizeLabel(view)}`;
}

/** A human dimension label for the thumbnail: the entered custom values with
 * their unit, or the named size's oriented dimensions in its conventional unit. */
export function sizeLabel(view: PageView): string {
  if (view.mode === 'custom') {
    const { w, h, unit } = view.custom;
    return `${w || '?'} × ${h || '?'} ${unit}`;
  }
  const base = namedSize(view.sizeName);
  if (base === undefined) {
    return view.sizeName;
  }
  const [w, h] = view.orientation === 'landscape' ? [base.h, base.w] : [base.w, base.h];
  return `${formatDimension(w, base.unit)} × ${formatDimension(h, base.unit)} ${base.unit}`;
}
