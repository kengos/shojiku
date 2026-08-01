// Wall-clock ⇄ RFC 3339 handling for the sample-data datetime editor. A
// datetime field is edited as its WALL CLOCK (a native `datetime-local` input),
// with the offset kept aside and re-attached on commit. The engine renders the
// authored wall clock WITHOUT timezone conversion (the offset is parse-only and
// display-inert), so this is ALL string surgery — never a `Date` round-trip,
// which would shift the wall clock by the offset. The engine also parse-rejects
// a seconds-less datetime, so a commit always emits seconds and an offset.

/** A datetime split into its wall-clock part (date + time, no offset) and its
 * trailing offset (`+09:00` / `-05:00` / `Z`), or `null` offset when absent. */
export interface SplitDateTime {
  /** `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` — seeds the `datetime-local`. */
  readonly wallClock: string;
  /** `+09:00` | `Z` | `null` (absent in the source value). */
  readonly offset: string | null;
}

// Anchored, fixed-shape: a hostile long string either matches this bounded
// datetime or returns null (raw-text fallback) — no catastrophic backtracking.
const DATETIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/;

/** Split an RFC-3339-ish datetime string, or `null` when the value is not a
 * datetime (a plain date, a number-shaped string, garbage) — the panel then
 * falls back to raw-text editing. Lenient on the offset (an offset-less or
 * seconds-less value still parses, so the user can edit and FIX it into a valid
 * RFC 3339 value on commit). A whole-minute `:00` seconds component is DROPPED
 * from the wall clock so it seeds a minute-precision `datetime-local` input
 * (a browser rejects a seconds value without a seconds step); the commit
 * re-adds `:00`, so it still round-trips. */
export function splitDateTime(value: string): SplitDateTime | null {
  const matched = DATETIME.exec(value);
  if (matched === null) {
    return null;
  }
  const minutes = matched[1];
  const seconds = matched[2];
  const wallClock = seconds !== undefined && seconds !== ':00' ? `${minutes}${seconds}` : minutes;
  return { wallClock, offset: matched[3] ?? null };
}

/** Compose a full RFC 3339 datetime from an edited wall clock plus the offset to
 * re-attach: the ORIGINAL offset when the value carried one (round-trip: the
 * offset the user never touched is preserved), else the locale fallback.
 * Seconds are always emitted (`:00` appended when the wall clock omits them). */
export function composeDateTime(
  wallClock: string,
  originalOffset: string | null,
  fallbackOffset: string,
): string {
  // A `datetime-local` with a seconds step may emit fractional seconds (`.000`
  // in jsdom, some browsers) — drop them; the wall clock renders to whole-second
  // precision, and a trailing `.000` would only churn the authored value.
  const trimmed = wallClock.replace(/(T\d{2}:\d{2}:\d{2})\.\d+$/, '$1');
  const withSeconds = /T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
  return `${withSeconds}${originalOffset ?? fallbackOffset}`;
}

/** Whether the `datetime-local` input needs a seconds step: the wall clock
 * carries a seconds component (only non-zero seconds survive `splitDateTime`, so
 * a whole-minute value needs no step). */
export function needsSecondsStep(wallClock: string): boolean {
  return /T\d{2}:\d{2}:\d{2}$/.test(wallClock);
}

/** The offset the sample data does NOT convert with — the neutral fallback for a
 * new or offset-less datetime (the engine never shifts the wall clock, so this
 * only picks the literal that trails it). */
export const DEFAULT_OFFSET = '+00:00';

// A tiny locale → representative-offset map. Looked up in a Map so a hostile
// locale tag (`constructor`, `__proto__`) can never walk a prototype chain.
const LOCALE_OFFSET = new Map<string, string>([
  ['ja-JP', '+09:00'],
  ['ja', '+09:00'],
]);

/** A representative UTC offset for the document locale — attached to a new or
 * offset-less datetime the user edits. Unknown / undefined locales fall back to
 * the neutral offset (harmless: display never shifts). */
export function representativeOffset(locale: string | undefined): string {
  if (locale === undefined) {
    return DEFAULT_OFFSET;
  }
  return LOCALE_OFFSET.get(locale) ?? DEFAULT_OFFSET;
}
