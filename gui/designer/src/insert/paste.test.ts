import { describe, expect, it } from 'vitest';
import { buildPasteScaffold, freshSourceKey } from './paste';
import { analyzeColumns } from './pasteColumns';
import { parsePasteGrid } from './pasteGrid';

function okGrid(text: string) {
  const parsed = parsePasteGrid(text);
  if (!parsed.ok) {
    throw new Error(`expected ok, got ${parsed.reason}`);
  }
  return parsed;
}

describe('analyzeColumns / buildPasteScaffold — ragged and empty inputs', () => {
  it('treats a missing cell as blank when a row is short of the header width', () => {
    // A hand-built ragged grid (parsePasteGrid squares rows; a direct caller
    // may not) — the absent column reads as an empty (text) column.
    const cols = analyzeColumns({ headers: ['a', 'b'], rows: [['1']] });
    expect(cols.map((c) => c.kind)).toEqual(['number', 'text']);
  });

  it('falls back to the key for an empty label and pads missing cells to null/blank', () => {
    const { spec, rows } = buildPasteScaffold({ headers: ['', 'b'], rows: [['x']] }, []);
    expect(spec.columns[0]).toEqual({ key: 'col1', label: 'col1' }); // empty header → key label
    expect(rows[0]).toEqual({ col1: 'x', b: '' }); // b column absent in the short row
  });
});

describe('freshSourceKey', () => {
  it('returns the base when free, else a numbered suffix', () => {
    expect(freshSourceKey('table', [])).toBe('table');
    expect(freshSourceKey('table', ['table'])).toBe('table_2');
    expect(freshSourceKey('table', ['table', 'table_2'])).toBe('table_3');
  });
});

describe('buildPasteScaffold', () => {
  it('builds a table spec + verbatim coerced rows, with a symbol format on money columns', () => {
    // The cells HAD a currency symbol, so the column reproduces it: `symbol`
    // coerces the number to the currency type at render (¥300, not 300).
    const grid = okGrid('品目\t金額\nりんご\t¥300\nみかん\t¥120').grid;
    const { spec, rows } = buildPasteScaffold(grid, []);
    expect(spec.sourceKey).toBe('table');
    expect(spec.columns).toEqual([
      { key: 'col1', label: '品目' }, // key slugs to colN, label keeps the header
      { key: 'col2', label: '金額', format: 'symbol' },
    ]);
    expect(rows).toEqual([
      { col1: 'りんご', col2: 300 },
      { col1: 'みかん', col2: 120 },
    ]);
  });

  it('derives a fresh source key against existing params', () => {
    const grid = okGrid('a\n1').grid;
    expect(buildPasteScaffold(grid, ['table', 'table_2']).spec.sourceKey).toBe('table_3');
  });

  it('never pollutes a prototype from a hostile header', () => {
    const grid = okGrid('__proto__\tname\npwned\tAlice').grid;
    const { rows } = buildPasteScaffold(grid, []);
    // The row object keys are the derived slugs, never __proto__, so the hostile
    // value lands as ordinary own data and the prototype is untouched.
    expect(Object.keys(rows[0])).toEqual(['col1', 'name']);
    expect(rows[0].col1).toBe('pwned');
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  });
});
