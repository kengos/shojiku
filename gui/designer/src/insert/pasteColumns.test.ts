// Tests for pasteColumns.ts — what a pasted column MEANS: charset-guarded
// key derivation, the closed kind switch, and per-cell value coercion.
import { describe, expect, it } from 'vitest';
import { analyzeColumns, coerceCell, inferKind } from './pasteColumns';
import { MAX_CELL_CHARS, parsePasteGrid } from './pasteGrid';

function okGrid(text: string) {
  const parsed = parsePasteGrid(text);
  if (!parsed.ok) {
    throw new Error(`expected ok, got ${parsed.reason}`);
  }
  return parsed;
}

describe('analyzeColumns — key derivation (charset-guarded)', () => {
  it('slugs ASCII headers and keeps the raw label', () => {
    const cols = analyzeColumns(okGrid('First Name\tE-mail\nA\tb').grid);
    expect(cols.map((c) => c.key)).toEqual(['First_Name', 'E_mail']);
    expect(cols.map((c) => c.label)).toEqual(['First Name', 'E-mail']);
  });

  it('falls back to colN for a non-ASCII / empty header, preserving the label', () => {
    const cols = analyzeColumns(okGrid('氏名\t\nA\tb').grid);
    expect(cols[0].key).toBe('col1');
    expect(cols[0].label).toBe('氏名');
    expect(cols[1].key).toBe('col2');
  });

  it('dedupes colliding derived keys, iterating past an already-taken suffix', () => {
    const cols = analyzeColumns(okGrid('Name\tName\tName\nA\tb\tc').grid);
    expect(cols.map((c) => c.key)).toEqual(['Name', 'Name_2', 'Name_3']);
  });

  it('never derives a reserved key from a hostile header', () => {
    const cols = analyzeColumns(okGrid('__proto__\tconstructor\nA\tb').grid);
    expect(cols.map((c) => c.key)).toEqual(['col1', 'col2']);
  });
});

describe('inferKind — closed switch', () => {
  it('infers number, including thousands separators and blanks', () => {
    expect(inferKind(['1', '2', '3'])).toBe('number');
    expect(inferKind(['1,000', '2,500'])).toBe('number');
    expect(inferKind(['1', '', '3'])).toBe('number');
    expect(inferKind(['-5', '+2', '0.5'])).toBe('number');
  });

  it('infers currency when a symbol is present', () => {
    expect(inferKind(['¥300,000', '¥1,200'])).toBe('currency');
    expect(inferKind(['$5', '10'])).toBe('currency'); // one symbol is enough
    expect(inferKind(['500円', '1,000円'])).toBe('currency');
    expect(inferKind(['100$', '200$'])).toBe('currency'); // a trailing symbol counts
  });

  it('infers boolean and date', () => {
    expect(inferKind(['true', 'FALSE'])).toBe('boolean');
    expect(inferKind(['2026-07-20', '2025-01-01'])).toBe('date');
    expect(inferKind(['2026/07/20'])).toBe('date');
  });

  it('falls back to text for mixed, formula, or empty columns', () => {
    expect(inferKind(['1', 'two'])).toBe('text');
    expect(inferKind(['=SUM(A1:A2)'])).toBe('text');
    expect(inferKind(['', '  '])).toBe('text');
    expect(inferKind([])).toBe('text');
  });
});

describe('coerceCell', () => {
  it('coerces number and currency to bare numbers', () => {
    expect(coerceCell('1,000', 'number')).toBe(1000);
    expect(coerceCell('¥300,000', 'currency')).toBe(300000);
    expect(coerceCell('500円', 'currency')).toBe(500);
    expect(coerceCell('100$', 'currency')).toBe(100);
  });

  it('coerces boolean and normalizes dates', () => {
    expect(coerceCell('TRUE', 'boolean')).toBe(true);
    expect(coerceCell('no', 'boolean')).toBe(false);
    expect(coerceCell('2026/07/20', 'date')).toBe('2026-07-20');
  });

  it('keeps a formula cell as literal text (never evaluated)', () => {
    expect(coerceCell('=1+1', 'text')).toBe('=1+1');
  });

  it('stores blank typed cells as null and clips text', () => {
    expect(coerceCell('', 'number')).toBeNull();
    expect(coerceCell('  ', 'date')).toBeNull();
    expect(coerceCell('x'.repeat(MAX_CELL_CHARS + 5), 'text')).toHaveLength(MAX_CELL_CHARS);
  });

  it('yields null for an unparseable numeric cell', () => {
    expect(coerceCell('abc', 'number')).toBeNull();
  });

  it('yields null rather than Infinity for an overflowing numeric cell', () => {
    expect(coerceCell('9'.repeat(309), 'number')).toBeNull();
  });
});
