// What a `defaults.locale` / `defaults.currency` pick actually DOES, as data the
// locale section can show: the engine's own date pattern, digit separators and
// default currency for every engine-resolvable locale, plus one illustrative
// rendering of each (the `FORMAT_SAMPLES` precedent — an example the reader can
// recognize beats a pattern they have to decode).
//
// The pattern / separator / currency fields are the ENGINE's, copied from the
// packs that define them (`engine/formatter/src/lang/builtin/*.yml` for the two
// builtins, `packs/locale/*.yml` for the shipped packs) and pinned to those
// files by a drift-guard test — the GUI never formats, it only reports what the
// engine's data says. `date` / `amount` are illustrative renderings of that same
// data at one fixed instant; they are examples, not a second formatter.

/** The fixed instant every `date` sample renders — a Monday, so a weekday token
 * in the pattern shows a recognizable value. */
export const SAMPLE_DATE_ISO = '2026-01-05';

/** The fixed amount every `amount` sample renders (at the currency's own CLDR
 * fraction digits — JPY carries none, the rest two). */
export const SAMPLE_AMOUNT = 1234;

/** The fixed number every `number` sample renders. Seven digits: shorter
 * values group identically under every rule the packs declare, so they
 * would show the separator while hiding the grouping. */
export const SAMPLE_NUMBER = 1234567.5;

export interface LocaleFacts {
  /** `dateFormats.default` — the pattern a bare `date` field renders through. */
  readonly datePattern: string;
  /** `number.groupSeparator`. */
  readonly groupSeparator: string;
  /** `number.decimalSeparator`. */
  readonly decimalSeparator: string;
  /** `SAMPLE_NUMBER` as this locale's own `number` block renders it —
   * illustrative, and long enough to show the GROUPING RULE, not just the
   * separator: Indian locales group `12,34,567.5` where the rest group
   * `1,234,567.5`. A literal for the same reason `date`/`amount` are — the
   * GUI reports engine data, it never formats. */
  readonly number: string;
  /** `currencyDefault` — the ISO code used when `defaults.currency` is unset. */
  readonly currencyDefault: string;
  /** That currency's `symbol`, and its `name` in this locale's own language. */
  readonly currencySymbol: string;
  readonly currencyName: string;
  /** `SAMPLE_DATE_ISO` through `datePattern` — illustrative. */
  readonly date: string;
  /** `SAMPLE_AMOUNT` through the default currency's `symbolFormat` —
   * illustrative. */
  readonly amount: string;
}

/** Keyed by the ENGINE-resolvable locale tag (`LocaleInfo.engineLocale`), not by
 * the picker's own tag: every regional English maps to `en-US`, which is the
 * locale the engine actually formats through. */
export const LOCALE_FACTS: Readonly<Record<string, LocaleFacts>> = {
  'ja-JP': {
    datePattern: 'yyyy/MM/dd(E)',
    groupSeparator: ',',
    decimalSeparator: '.',
    number: '1,234,567.5',
    currencyDefault: 'JPY',
    currencySymbol: '¥',
    currencyName: '円',
    date: '2026/01/05(月)',
    amount: '¥1,234',
  },
  'en-US': {
    datePattern: 'MMM d, y',
    groupSeparator: ',',
    decimalSeparator: '.',
    number: '1,234,567.5',
    currencyDefault: 'USD',
    currencySymbol: '$',
    currencyName: 'US dollars',
    date: 'Jan 5, 2026',
    amount: '$1,234.00',
  },
  'zh-CN': {
    datePattern: 'y年M月d日',
    groupSeparator: ',',
    decimalSeparator: '.',
    number: '1,234,567.5',
    currencyDefault: 'CNY',
    currencySymbol: '¥',
    currencyName: '人民币',
    date: '2026年1月5日',
    amount: '¥1,234.00',
  },
  'zh-TW': {
    datePattern: 'y年M月d日',
    groupSeparator: ',',
    decimalSeparator: '.',
    number: '1,234,567.5',
    currencyDefault: 'TWD',
    currencySymbol: '$',
    currencyName: '新台幣',
    date: '2026年1月5日',
    amount: '$1,234.00',
  },
  'hi-IN': {
    datePattern: 'd MMM y',
    groupSeparator: ',',
    decimalSeparator: '.',
    number: '12,34,567.5',
    currencyDefault: 'INR',
    currencySymbol: '₹',
    currencyName: 'भारतीय रुपए',
    date: '5 जन॰ 2026',
    amount: '₹1,234.00',
  },
  'fil-PH': {
    datePattern: 'MMM d, y',
    groupSeparator: ',',
    decimalSeparator: '.',
    number: '1,234,567.5',
    currencyDefault: 'PHP',
    currencySymbol: '₱',
    currencyName: 'piso ng Pilipinas',
    date: 'Ene 5, 2026',
    amount: '₱1,234.00',
  },
};

/** The facts for an authored `defaults.locale` value. A tag the engine cannot
 * resolve (unset, a typo, a hostile string) has no facts to report — the caller
 * shows nothing rather than guessing. Own-property-guarded: a `constructor` /
 * `__proto__` locale must not reach an inherited value. */
export function localeFacts(tag: string): LocaleFacts | null {
  return Object.hasOwn(LOCALE_FACTS, tag) ? LOCALE_FACTS[tag] : null;
}

/** CLDR fraction digits per offered currency code, copied from the engine's
 * `currency-fractions.yml` and pinned to it by the drift-guard test. Codes not
 * listed there use CLDR's default of 2, so this table spells out only the
 * offered set. */
export const CURRENCY_DIGITS: Readonly<Record<string, number>> = {
  JPY: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  CNY: 2,
  KRW: 0,
  TWD: 2,
  HKD: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  INR: 2,
  PHP: 2,
  THB: 2,
};

/** `SAMPLE_AMOUNT` written with a locale's separators at a currency's fraction
 * digits — how much of an amount the reader will actually see (`1,234` for JPY,
 * `1,234.00` for USD). Composed from engine data, never formatted: an offered
 * code always has a digits entry, and an unknown one falls back to CLDR's 2. */
export function amountSample(facts: LocaleFacts, code: string): string {
  const digits = Object.hasOwn(CURRENCY_DIGITS, code) ? CURRENCY_DIGITS[code] : 2;
  const whole = `1${facts.groupSeparator}234`;
  return digits === 0 ? whole : `${whole}${facts.decimalSeparator}${'0'.repeat(digits)}`;
}
