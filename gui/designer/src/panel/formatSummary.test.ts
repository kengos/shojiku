import { describe, expect, it } from 'vitest';
import { formatSectionSummary } from './formatSummary';

/** A translate stub that reports the key and its args, so the test asserts
 * WHICH wording was chosen and what it was given — not the English text. */
const t = (key: string, args: Record<string, unknown> = {}) =>
  `${key}(${Object.entries(args)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;

describe('formatSectionSummary', () => {
  it('says so when nothing is set, and still counts the registry', () => {
    expect(formatSectionSummary(undefined, { a: {}, b: {} }, t)).toBe(
      'formats.summaryUnset(registry=2)',
    );
  });

  it('names the single set type and its value', () => {
    expect(formatSectionSummary({ formats: { date: 'wareki' } }, undefined, t)).toBe(
      'formats.summaryOne(type=format.label.date(),value=format.variant.wareki(),others=0,registry=0)',
    );
  });

  it('names the FIRST set type and counts the rest', () => {
    const summary = formatSectionSummary(
      { formats: { datetime: 'compact', currency: 'symbol', date: 'wareki' } },
      { closing: {} },
      t,
    );
    // `date` leads the declared order, so it is the one named.
    expect(summary).toBe(
      'formats.summaryMany(type=format.label.date(),value=format.variant.wareki(),others=2,registry=1)',
    );
  });

  it('shows an uncatalogued spelling as its bare wire spelling', () => {
    expect(formatSectionSummary({ formats: { date: 'closing' } }, undefined, t)).toContain(
      'value=closing',
    );
  });

  it('names an inline pattern rather than pasting it into the rail', () => {
    expect(
      formatSectionSummary({ formats: { date: { pattern: 'yyyy年M月d日(EEEE)' } } }, undefined, t),
    ).toContain('value=formats.customPattern()');
  });
});
