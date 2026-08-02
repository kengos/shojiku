import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n/locales';
import {
  amountSample,
  CURRENCY_DIGITS,
  LOCALE_FACTS,
  localeFacts,
  SAMPLE_NUMBER,
} from './localeFacts';

/** The engine file that DEFINES each locale's formatting data. The two builtins
 * are compiled into the formatter; the rest ship as locale packs. */
const PACK_FILE: Readonly<Record<string, string>> = {
  'ja-JP': '../../../../engine/formatter/src/lang/builtin/ja-jp.yml',
  'en-US': '../../../../engine/formatter/src/lang/builtin/en-us.yml',
  'zh-CN': '../../../../packs/locale/zh-cn.yml',
  'zh-TW': '../../../../packs/locale/zh-tw.yml',
  'hi-IN': '../../../../packs/locale/hi-in.yml',
  'fil-PH': '../../../../packs/locale/fil-ph.yml',
};

const FRACTIONS_FILE = '../../../../engine/formatter/src/lang/builtin/currency-fractions.yml';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function scalar(pack: string, key: string): string {
  const match = new RegExp(`^${key}: *(\\S+)$`, 'm').exec(pack);
  if (match === null) {
    throw new Error(`no ${key} in pack`);
  }
  return match[1];
}

describe('LOCALE_FACTS — pinned to the engine packs that define them', () => {
  // The GUI reports what the engine's data says; a regenerated CLDR pack must
  // not leave the locale section quietly claiming the old behavior.
  for (const [tag, file] of Object.entries(PACK_FILE)) {
    it(`matches the shipped ${tag} data`, () => {
      const pack = read(file);
      const facts = LOCALE_FACTS[tag];
      expect(scalar(pack, 'id')).toBe(tag);
      expect(facts.datePattern).toBe(/^dateFormats:\n {2}default: *"(.*?)"/m.exec(pack)?.[1]);
      const separators =
        /^number:\n {2}groupSeparator: *"(.*?)"\n {2}decimalSeparator: *"(.*?)"/m.exec(pack);
      expect(facts.groupSeparator).toBe(separators?.[1]);
      expect(facts.decimalSeparator).toBe(separators?.[2]);
      // The `number` sample is a literal, so pin its SHAPE to the pack's
      // declared group sizes: reading right to left the groups must run
      // [primary, secondary, secondary, …]. Absent keys mean uniform 3s.
      // This checks the literal against engine data without reimplementing
      // grouping in the GUI.
      const primary = Number(/^ {2}groupSize: *(\d+)$/m.exec(pack)?.[1] ?? 3);
      const secondary = Number(/^ {2}secondaryGroupSize: *(\d+)$/m.exec(pack)?.[1] ?? primary);
      const [integer] = facts.number.split(facts.decimalSeparator);
      const groups = integer.split(facts.groupSeparator).reverse();
      expect(groups[0].length, `${tag} first group`).toBe(primary);
      for (const group of groups.slice(1, -1)) {
        expect(group.length, `${tag} middle group`).toBe(secondary);
      }
      // The leading group is whatever digits remain, never wider than one.
      expect(groups.at(-1)?.length).toBeLessThanOrEqual(secondary);
      expect(facts.currencyDefault).toBe(scalar(pack, 'currencyDefault'));
      const currency = new RegExp(
        `^ {2}${facts.currencyDefault}:\\n {4}symbol: *"(.*?)"\\n {4}name: *"(.*?)"`,
        'm',
      ).exec(pack);
      expect(facts.currencySymbol).toBe(currency?.[1]);
      expect(facts.currencyName).toBe(currency?.[2]);
    });
  }

  it('matches the engine CLDR fraction digits for every offered currency', () => {
    const fractions = read(FRACTIONS_FILE);
    for (const [code, digits] of Object.entries(CURRENCY_DIGITS)) {
      // A code absent from the file uses CLDR's default of 2.
      const listed = new RegExp(`^${code}: *(\\d+)$`, 'm').exec(fractions);
      expect([code, digits]).toEqual([code, listed === null ? 2 : Number(listed[1])]);
    }
  });

  it('covers every engine locale the picker can resolve to', () => {
    // A picker entry whose engineLocale had no facts would silently show
    // nothing where the section promises to explain the choice.
    for (const locale of LOCALES) {
      expect(Object.hasOwn(LOCALE_FACTS, locale.engineLocale)).toBe(true);
    }
  });
});

describe('localeFacts', () => {
  it('resolves a known tag', () => {
    expect(localeFacts('ja-JP')?.currencyDefault).toBe('JPY');
  });

  it('returns null for an unset or unknown tag', () => {
    expect(localeFacts('')).toBeNull();
    expect(localeFacts('xx-YY')).toBeNull();
  });

  it('returns null for a prototype key rather than an inherited value', () => {
    // A hostile `defaults.locale` must not reach `Object.prototype`.
    expect(localeFacts('constructor')).toBeNull();
    expect(localeFacts('__proto__')).toBeNull();
    expect(localeFacts('toString')).toBeNull();
  });
});

describe('the number sample shows the grouping RULE, not just the separator', () => {
  it('groups hi-IN the Indian way, unlike the uniform locales', () => {
    // The regression this sample length exists to prevent: at 1,234.5 every
    // locale looked identical, so the panel silently under-described hi-IN.
    expect(LOCALE_FACTS['hi-IN'].number).toBe('12,34,567.5');
    for (const tag of ['ja-JP', 'en-US', 'zh-CN', 'zh-TW', 'fil-PH'] as const) {
      expect(LOCALE_FACTS[tag].number, tag).toBe('1,234,567.5');
    }
  });

  it('renders the same digits everywhere — only the grouping differs', () => {
    const digits = (tag: string) => LOCALE_FACTS[tag].number.replace(/[^0-9]/g, '');
    expect(digits('hi-IN')).toBe(digits('en-US'));
    expect(digits('hi-IN')).toBe(String(SAMPLE_NUMBER).replace(/[^0-9]/g, ''));
  });
});

describe('amountSample', () => {
  it('drops the decimals for a zero-digit currency', () => {
    expect(amountSample(LOCALE_FACTS['ja-JP'], 'JPY')).toBe('1,234');
  });

  it('keeps two decimals for an ordinary currency', () => {
    expect(amountSample(LOCALE_FACTS['ja-JP'], 'USD')).toBe('1,234.00');
  });

  it('falls back to CLDR’s two digits for a code outside the offered set', () => {
    expect(amountSample(LOCALE_FACTS['ja-JP'], 'CHF')).toBe('1,234.00');
  });

  it('does not read a prototype key as a digit count', () => {
    expect(amountSample(LOCALE_FACTS['ja-JP'], 'constructor')).toBe('1,234.00');
  });
});
