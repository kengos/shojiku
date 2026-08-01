// @vitest-environment node
import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import { fakerLocaleKey, loadFakerSynth, makeFakerSynth } from './fakerSynth';

const spec = (over: Partial<Parameters<ReturnType<typeof makeFakerSynth>>[0]> = {}) => ({
  type: 'string',
  keyPath: 'a.b',
  locale: 'en',
  constraints: {},
  ...over,
});

describe('makeFakerSynth', () => {
  it('is deterministic per key path', () => {
    const synth = makeFakerSynth(faker);
    expect(synth(spec({ format: 'person-name' }))).toBe(synth(spec({ format: 'person-name' })));
  });

  it('produces hint-shaped values for known formats', () => {
    const synth = makeFakerSynth(faker);
    expect(synth(spec({ format: 'email' }))).toContain('@');
    expect(typeof synth(spec({ format: 'person-name' }))).toBe('string');
    expect(synth(spec({ format: 'date' }))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Every mapped format resolves to a non-empty string (covers each generator).
    for (const format of ['url', 'phone', 'address', 'city', 'company-name', 'date-time']) {
      expect((synth(spec({ format })) as string).length).toBeGreaterThan(0);
    }
  });

  it('falls back to a lorem phrase for an unknown or absent format', () => {
    const synth = makeFakerSynth(faker);
    expect(typeof synth(spec({ format: 'mystery' }))).toBe('string');
    expect(typeof synth(spec())).toBe('string');
  });

  it('treats prototype-name formats as unknown, never walking the prototype', () => {
    // A hostile schema can name any `format`; `constructor`/`toString` must
    // miss the generator map (a plain-object lookup would return — and CALL —
    // the inherited function).
    const synth = makeFakerSynth(faker);
    for (const format of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(typeof synth(spec({ format }))).toBe('string');
    }
  });

  it('generates numbers within the bounds, collapsing a contradictory range', () => {
    const synth = makeFakerSynth(faker);
    const n = synth(spec({ type: 'number', constraints: { minimum: 5, maximum: 10 } })) as number;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(10);
    const i = synth(spec({ type: 'integer', constraints: {} })) as number;
    expect(Number.isInteger(i)).toBe(true);
    // A contradictory max is ignored (no throw); the generator's own clamp
    // brings the final value back to the bound.
    expect(
      synth(spec({ type: 'integer', constraints: { minimum: 7, maximum: 2 } })) as number,
    ).toBeGreaterThanOrEqual(7);
  });

  it('synthesizes whole-number amounts for money-shaped (currency) fields', () => {
    const synth = makeFakerSynth(faker);
    // No decimals, ever — an invoice amount reads wrong as 474.92 (default cap).
    expect(Number.isInteger(synth(spec({ type: 'number', format: 'currency' })))).toBe(true);
    // Respects an explicit max…
    const capped = synth(
      spec({ type: 'number', format: 'currency', constraints: { minimum: 100, maximum: 500 } }),
    ) as number;
    expect(Number.isInteger(capped)).toBe(true);
    expect(capped).toBeGreaterThanOrEqual(100);
    expect(capped).toBeLessThanOrEqual(500);
    // …and ignores a contradictory max (min > max), staying whole and ≥ min.
    const contradictory = synth(
      spec({ type: 'number', format: 'currency', constraints: { minimum: 300, maximum: 2 } }),
    ) as number;
    expect(Number.isInteger(contradictory)).toBe(true);
    expect(contradictory).toBeGreaterThanOrEqual(300);
  });

  it('keeps the fractional path for non-currency number formats (money-shaping is currency-only)', () => {
    // A non-currency number format must NOT take the integer money path — it
    // stays on the float generator (percentage/quantity legitimately carry
    // decimals). Gated on the literal `format === 'currency'`, never presence.
    expect(typeof makeFakerSynth(faker)(spec({ type: 'number', format: 'percentage' }))).toBe(
      'number',
    );
  });

  it('generates booleans', () => {
    expect(typeof makeFakerSynth(faker)(spec({ type: 'boolean' }))).toBe('boolean');
  });
});

describe('fakerLocaleKey', () => {
  it('maps engine locales and defaults to en', () => {
    expect(fakerLocaleKey('ja-JP')).toBe('ja');
    expect(fakerLocaleKey('zh-TW')).toBe('zh_TW');
    expect(fakerLocaleKey('xx-YY')).toBe('en');
  });

  it('defaults a prototype-name engine locale to en (hostile mounted host)', () => {
    expect(fakerLocaleKey('constructor')).toBe('en');
    expect(fakerLocaleKey('__proto__')).toBe('en');
  });
});

describe('loadFakerSynth', () => {
  it('loads the mapped locale module and returns a working synth', async () => {
    const load = vi.fn(async (_key: string) => ({ faker }));
    const synth = await loadFakerSynth('ja-JP', load);
    expect(load).toHaveBeenCalledWith('ja');
    expect(typeof synth(spec())).toBe('string');
  });
});
