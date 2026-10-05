// The document copy a field with its own currency is sampled through: only
// `defaults.currency` changes, the code goes in as a quoted scalar, and a
// document the op layer cannot edit yields no copy.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { withCurrency } from './currencyCopy';

const DOC = 'defaults:\n  locale: ja-JP # the locale\n  currency: JPY\nsections: {}\n';
const read = (text: string) => readTemplate(parseTemplate(text)) as Record<string, unknown>;

describe('withCurrency', () => {
  it('changes the currency and nothing else', () => {
    const copy = withCurrency(DOC, 'USD');
    expect(copy).toBe(DOC.replace('currency: JPY', 'currency: USD'));
  });

  it('creates the defaults block when the document has none', () => {
    const copy = withCurrency('sections: {}\n', 'EUR') as string;
    expect(read(copy).defaults).toEqual({ currency: 'EUR' });
  });

  it('writes a hostile code as one quoted scalar', () => {
    const copy = withCurrency(DOC, 'a: b\n  c: d') as string;
    expect((read(copy).defaults as Record<string, unknown>).currency).toBe('a: b\n  c: d');
    expect(Object.keys(read(copy).defaults as object)).toEqual(['locale', 'currency']);
  });

  it('gives no copy for a document that does not parse or whose defaults is not a map', () => {
    expect(withCurrency('a: [', 'USD')).toBeNull();
    expect(withCurrency('defaults: 3\n', 'USD')).toBeNull();
  });
});
