import { describe, expect, it } from 'vitest';
import { ORIGIN_HEADING_KEY, variantLabelKey } from './formatLabels';

describe('variantLabelKey', () => {
  it('names a known spelling’s catalog key', () => {
    expect(variantLabelKey('wareki')).toBe('format.variant.wareki');
    expect(variantLabelKey('wareki-compact')).toBe('format.variant.warekiCompact');
    // Reuses the currency labels the binding picker already ships.
    expect(variantLabelKey('symbol')).toBe('format.label.symbol');
  });

  it('has NO key for a spelling it does not carry — it displays as itself', () => {
    // A locale pack that ships a new variant, and every author-defined
    // registry name, take this path (user decision).
    expect(variantLabelKey('ja')).toBeUndefined();
    expect(variantLabelKey('closing')).toBeUndefined();
  });

  it('never resolves a prototype name to an inherited value', () => {
    expect(variantLabelKey('__proto__')).toBeUndefined();
    expect(variantLabelKey('constructor')).toBeUndefined();
    expect(variantLabelKey('toString')).toBeUndefined();
  });
});

describe('ORIGIN_HEADING_KEY', () => {
  it('carries a heading for every origin the engine can report', () => {
    expect(Object.keys(ORIGIN_HEADING_KEY).sort()).toEqual(['builtin', 'pack', 'registry']);
  });
});
