import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { composeOverlay, readUses } from './overlay';

describe('composeOverlay', () => {
  it('creates an overlay naming every pack for a builtin locale', () => {
    const text = composeOverlay(null, ['biz-ud', 'gf-lato']);
    expect(parse(text)).toEqual({ fonts: { uses: ['biz-ud', 'gf-lato'] } });
  });

  it('restates the WHOLE list, since a merged sequence replaces rather than appends', () => {
    const text = composeOverlay(null, ['a', 'b', 'c']);
    expect((parse(text) as { fonts: { uses: string[] } }).fonts.uses).toEqual(['a', 'b', 'c']);
  });

  it('preserves every other key of an existing pack', () => {
    // A shipped locale (zh-TW) is a WHOLE pack, not a thin overlay: dropping a
    // key here would drop that locale's formats.
    const existing = [
      'fonts:',
      '  uses: [noto-sans-tc, noto-sans-mono]',
      '  default: noto-sans-tc',
      '  fallback: [noto-sans-mono]',
      'currencyDefault: TWD',
      'number:',
      '  groupSeparator: ","',
      '',
    ].join('\n');
    const parsed = parse(
      composeOverlay(existing, ['noto-sans-tc', 'noto-sans-mono', 'gf-lato']),
    ) as {
      fonts: { uses: string[]; default: string; fallback: string[] };
      currencyDefault: string;
      number: { groupSeparator: string };
    };
    expect(parsed.fonts.uses).toEqual(['noto-sans-tc', 'noto-sans-mono', 'gf-lato']);
    expect(parsed.fonts.default).toBe('noto-sans-tc');
    expect(parsed.fonts.fallback).toEqual(['noto-sans-mono']);
    expect(parsed.currencyDefault).toBe('TWD');
    expect(parsed.number.groupSeparator).toBe(',');
  });

  it('leaves the default face alone, so a picked font is available but not imposed', () => {
    const existing = 'fonts:\n  uses: [biz-ud]\n  default: biz-udp-gothic\n';
    const parsed = parse(composeOverlay(existing, ['biz-ud', 'gf-lato'])) as {
      fonts: { default: string };
    };
    expect(parsed.fonts.default).toBe('biz-udp-gothic');
  });

  it('handles an empty existing document', () => {
    expect(parse(composeOverlay('', ['a']))).toEqual({ fonts: { uses: ['a'] } });
  });
});

describe('readUses', () => {
  it('reads a declared uses list', () => {
    expect(readUses('fonts:\n  uses: [a, b]\n')).toEqual(['a', 'b']);
  });

  it('returns empty for a pack with no fonts block', () => {
    expect(readUses('currencyDefault: JPY\n')).toEqual([]);
    expect(readUses('')).toEqual([]);
  });

  it('drops non-string entries rather than trusting the shape', () => {
    expect(readUses('fonts:\n  uses: [a, 3, null, b]\n')).toEqual(['a', 'b']);
  });

  it('ignores a non-sequence uses', () => {
    expect(readUses('fonts:\n  uses: nope\n')).toEqual([]);
  });
});
