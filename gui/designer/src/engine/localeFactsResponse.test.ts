import { describe, expect, it } from 'vitest';
import { toLocaleFacts } from './localeFactsResponse';
import { TransportError } from './transport';

const GOOD = {
  id: 'ja-JP',
  date: '2026/11/03(火)',
  number: '12,345,678.9',
  currencyDefault: 'JPY',
  amount: '1,234,568',
};

describe('toLocaleFacts', () => {
  it('reads a well-formed response', () => {
    expect(toLocaleFacts(JSON.stringify(GOOD))).toEqual(GOOD);
  });

  it('keeps an empty currency code, which is a real answer', () => {
    // A pack that declares no default currency reports `''`. That is not a
    // malformed field — the caller decides what to say about it — so the
    // guard must not treat it as one.
    const bare = { ...GOOD, currencyDefault: '' };
    expect(toLocaleFacts(JSON.stringify(bare)).currencyDefault).toBe('');
  });

  it('refuses malformed JSON', () => {
    expect(() => toLocaleFacts('{')).toThrow(TransportError);
  });

  it('refuses a non-object response', () => {
    expect(() => toLocaleFacts('"ja-JP"')).toThrow(/expected an object/);
  });

  // One case per field, because each is a separate `fail` leg and a panel
  // that printed `undefined` at a reader would be worse than one that
  // explains nothing.
  for (const field of ['id', 'date', 'number', 'currencyDefault', 'amount'] as const) {
    it(`refuses a non-string ${field}`, () => {
      expect(() => toLocaleFacts(JSON.stringify({ ...GOOD, [field]: 7 }))).toThrow(
        new RegExp(`locale facts\\.${field}: expected a string`),
      );
    });

    it(`refuses a missing ${field}`, () => {
      const partial: Record<string, unknown> = { ...GOOD };
      delete partial[field];
      expect(() => toLocaleFacts(JSON.stringify(partial))).toThrow(TransportError);
    });
  }
});
