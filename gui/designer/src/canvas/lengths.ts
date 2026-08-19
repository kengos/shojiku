// Pure length math for canvas manipulation of absolutely placed boxes:
// reading an authored `box` length (a bare pt number, or an absolute-unit
// string like "12mm"), formatting a committed value back in the AUTHORED form
// at a fixed per-unit precision (no float noise in the diff — the
// template-engineer gate), and grid quantization. Relative units (%/em/rem)
// are unsupported here by design: the caller refuses the manipulation instead
// of rewriting authoring intent into fixed points.

import { type SizeUnit, unitToPt } from '../panel/pageSizes';

/** An authored length value in points, remembering the form it was written
 * in: `unit` is `null` for a bare number (pt, the engine unit), or the
 * absolute unit of a `"12mm"`-style string. */
export interface AuthoredLength {
  readonly pt: number;
  readonly unit: SizeUnit | null;
}

/** A bare-number (pt) authored length — the base for an absent key. */
export function ptLength(pt: number): AuthoredLength {
  return { pt, unit: null };
}

// Bounds the regex against hostile input; an authored length is short.
const MAX_LENGTH_CHARS = 32;

// Signed decimal + optional absolute unit, anchored and linear. Relative
// units (%/em/rem) deliberately do NOT match — they read as "not an absolute
// length" and the manipulation is refused.
const LENGTH_RE = /^(-?\d+(?:\.\d+)?)(mm|cm|in|pt)?$/;

/** Decimal places a committed value keeps, per authored form. Chosen so the
 * position granularity stays sub-pt (mm 1dp ≈ 0.28pt) while the diff stays
 * clean ("12.4mm", never "12.39999mm"). */
const UNIT_DECIMALS: Record<SizeUnit, number> = { mm: 1, cm: 2, in: 2, pt: 1 };
const NUMBER_DECIMALS = 2;

/** Read an authored `box` length value: a finite number is pt; a string must
 * be `<signed numeral><absolute unit?>` (a unitless numeral string commits
 * back as a canonical number). `null` for anything else — relative units,
 * garbage, non-finite, maps/arrays. */
/** Whether a value is a RELATIVE length (`100%`, `2em`, `1.5rem`) — legal wire
 * the engine resolves at layout, but not something the panel can step by
 * points. Distinct from "`readLength` refused it": that is also true of an
 * empty field and of garbage (`auto`, `12 mm`, a typo), and telling THOSE
 * authors their value is a percent or em is a lie about their own document. */
export function isRelativeLength(value: string): boolean {
  return /^-?\d+(?:\.\d+)?(?:%|r?em)$/.test(value.trim());
}

export function readLength(value: unknown): AuthoredLength | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { pt: value, unit: null } : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH_CHARS) {
    return null;
  }
  const matched = LENGTH_RE.exec(trimmed);
  if (matched === null) {
    return null;
  }
  // The regex admits only a plain decimal numeral of ≤32 chars (≤1e32), so
  // the parsed number is always finite.
  const numeral = Number(matched[1]);
  const unit = (matched[2] as SizeUnit | undefined) ?? null;
  return unit === null ? { pt: numeral, unit: null } : { pt: unitToPt(numeral, unit), unit };
}

/** Format a pt value in the authored form: a rounded plain number when
 * `unit` is null, else a `"<numeral><unit>"` string at the unit's fixed
 * precision (trailing zeros trimmed, `-0` normalized). `null` when the value
 * is not finite — a hostile delta must not reach an op. */
export function formatLength(pt: number, unit: SizeUnit | null): number | string | null {
  if (!Number.isFinite(pt)) {
    return null;
  }
  if (unit === null) {
    const factor = 10 ** NUMBER_DECIMALS;
    const rounded = Math.round(pt * factor) / factor;
    // Math.round of a huge value stays finite, but the multiply can overflow.
    if (!Number.isFinite(rounded)) {
      return null;
    }
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  // Every unit keeps ≥1 decimal, so toFixed always emits a dot to trim from.
  const fixed = (pt / unitToPt(1, unit)).toFixed(UNIT_DECIMALS[unit]);
  let cleaned = fixed.replace(/\.?0+$/, '');
  if (cleaned === '-0' || cleaned === '') {
    cleaned = '0';
  }
  return `${cleaned}${unit}`;
}

/** Quantize a pt value to the grid `step` (pt); a non-positive step is "grid
 * off" and returns the value untouched. */
export function snapLength(pt: number, step: number): number {
  if (!(step > 0)) {
    return pt;
  }
  return Math.round(pt / step) * step;
}

/** Step an authored length by `dir * step` (pt), preserving the authored form:
 * a bare number stays a number, a `"12mm"` stays mm at the unit's precision.
 * The step is NOT re-snapped to the grid, so `↑` then `↓` round-trips exactly
 * (nudge reversibility — an off-grid value keeps its offset). Returns `null`
 * when the current value is not a readable absolute length/number (relative
 * units, empty, garbage) or the stepped value overflows to non-finite — the
 * caller then dispatches nothing. */
export function stepLength(current: string, dir: number, step: number): number | string | null {
  const base = readLength(current);
  if (base === null) {
    return null;
  }
  return formatLength(base.pt + dir * step, base.unit);
}
