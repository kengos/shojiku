import { describe, expect, it } from 'vitest';
import { formatCatalogKey } from './catalogKey';

const doc = (...lines: string[]) => `${lines.join('\n')}\n`;

describe('formatCatalogKey', () => {
  const SOURCE = doc(
    'page: { size: A4 }',
    'formats:',
    '  closing: { type: date, pattern: "yyyy" }',
    'defaults:',
    '  locale: ja-JP',
    '  currency: JPY',
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - { type: text, text: hi }',
  );

  it('keeps only the two blocks the catalog reads', () => {
    expect(formatCatalogKey(SOURCE)).toBe(
      [
        'formats:',
        '  closing: { type: date, pattern: "yyyy" }',
        'defaults:',
        '  locale: ja-JP',
        '  currency: JPY',
      ].join('\n'),
    );
  });

  it('does not change when only the body changes', () => {
    const edited = SOURCE.replace('text: hi', 'text: hello there');
    expect(formatCatalogKey(edited)).toBe(formatCatalogKey(SOURCE));
  });

  it('changes when a format default, the locale or the registry changes', () => {
    expect(formatCatalogKey(SOURCE.replace('ja-JP', 'en-US'))).not.toBe(formatCatalogKey(SOURCE));
    expect(formatCatalogKey(SOURCE.replace('closing', 'cutoff'))).not.toBe(
      formatCatalogKey(SOURCE),
    );
  });

  it('produces a key for a document that does not parse — the live picker still needs one', () => {
    expect(
      formatCatalogKey(doc('formats:', '  a: { type: date,', 'sections: [')).length,
    ).toBeGreaterThan(0);
  });

  it('is empty when neither block is present', () => {
    expect(formatCatalogKey(doc('sections:', '  body: { type: absolute }'))).toBe('');
  });

  it('stops capturing at the next top-level key, tabs included', () => {
    expect(formatCatalogKey(doc('formats:', '  a: 1', 'page: A4', '  ignored: 2'))).toBe(
      'formats:\n  a: 1',
    );
    expect(formatCatalogKey(doc('formats:', '\ta: 1', 'page: A4'))).toBe('formats:\n\ta: 1');
  });
});
