// Pure relative-freshness bucketing for the restore-points list. Maps an elapsed
// interval to a signed value + unit that `Intl.RelativeTimeFormat` (numeric:
// 'auto') renders locale-correctly ("5分前" / "5 min ago" / "昨日" / "yesterday")
// — so the dialog needs NO catalog strings for freshness (and dodges the ICU
// brace-in-value fallback trap). Kept framework-free and exhaustively unit-tested.

/** A relative time as `Intl.RelativeTimeFormat.format` consumes it: a negative
 * `value` is in the past, and `value: 0, unit: 'second'` renders as "now". */
export interface Freshness {
  readonly value: number;
  readonly unit: 'second' | 'minute' | 'hour' | 'day';
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Bucket the interval `now - createdAt` into the coarsest sensible unit. A
 * createdAt in the future (clock skew) clamps to "now". */
export function freshness(createdAt: number, now: number): Freshness {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < MIN) {
    return { value: 0, unit: 'second' };
  }
  if (elapsed < HOUR) {
    return { value: -Math.floor(elapsed / MIN), unit: 'minute' };
  }
  if (elapsed < DAY) {
    return { value: -Math.floor(elapsed / HOUR), unit: 'hour' };
  }
  return { value: -Math.floor(elapsed / DAY), unit: 'day' };
}
