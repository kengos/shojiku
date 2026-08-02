// Tests for pasteGrid.ts — parsing a pasted TSV/CSV block into a bounded
// grid: delimiter detection, quoted fields, refusals, and the caps.
import { describe, expect, it } from 'vitest';
import {
  MAX_CELL_CHARS,
  MAX_PASTE_BYTES,
  MAX_PASTE_COLUMNS,
  MAX_PASTE_ROWS,
  parsePasteGrid,
} from './pasteGrid';

function okGrid(text: string) {
  const parsed = parsePasteGrid(text);
  if (!parsed.ok) {
    throw new Error(`expected ok, got ${parsed.reason}`);
  }
  return parsed;
}

describe('parsePasteGrid — delimiters', () => {
  it('parses TSV with the first row as headers', () => {
    const p = okGrid('name\tage\nAlice\t30\nBob\t25');
    expect(p.grid.headers).toEqual(['name', 'age']);
    expect(p.grid.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
    expect(p.truncated).toBe(false);
  });

  it('handles CRLF and CR-only line endings', () => {
    expect(okGrid('a\tb\r\n1\t2').grid.rows).toEqual([['1', '2']]);
    expect(okGrid('a\tb\r1\t2').grid.rows).toEqual([['1', '2']]);
  });

  it('parses CSV when there are no tabs, incl. CRLF row endings', () => {
    const p = okGrid('name,age\nAlice,30');
    expect(p.grid.headers).toEqual(['name', 'age']);
    expect(p.grid.rows).toEqual([['Alice', '30']]);
    expect(okGrid('name,age\r\nAlice,30').grid.rows).toEqual([['Alice', '30']]);
  });

  it('honors CSV quoting: embedded comma, newline, and escaped quote', () => {
    const p = okGrid('name,note\n"Doe, John","line1\nline2"\n"say ""hi""",x');
    expect(p.grid.rows[0]).toEqual(['Doe, John', 'line1\nline2']);
    expect(p.grid.rows[1]).toEqual(['say "hi"', 'x']);
  });

  it('tolerates an unterminated CSV quote (absorbs the rest, never throws)', () => {
    const p = okGrid('a,b\n"unterminated,still one field');
    // Absorbed as one field, then squared to the 2-col header width.
    expect(p.grid.rows[0]).toEqual(['unterminated,still one field', '']);
  });
});

describe('parsePasteGrid — refusals and blank handling', () => {
  it('refuses empty / whitespace-only input', () => {
    expect(parsePasteGrid('')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePasteGrid('   \n  \t ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a header-only paste (no data rows)', () => {
    expect(parsePasteGrid('name\tage')).toEqual({ ok: false, reason: 'no_rows' });
  });

  it('refuses when every header cell within the column cap is blank', () => {
    // 16 empty header cells then a value past the cap → the kept header is blank.
    const header = `${'\t'.repeat(MAX_PASTE_COLUMNS)}h`;
    expect(parsePasteGrid(`${header}\n1`)).toEqual({ ok: false, reason: 'no_columns' });
  });

  it('drops leading blank lines and a trailing newline', () => {
    const p = okGrid('\n\nname\tage\nA\t1\n');
    expect(p.grid.headers).toEqual(['name', 'age']);
    expect(p.grid.rows).toEqual([['A', '1']]);
  });
});

describe('parsePasteGrid — caps', () => {
  it('squares ragged rows to the header width and flags truncation', () => {
    const p = okGrid('a\tb\tc\n1\n1\t2\t3\t4');
    expect(p.grid.rows).toEqual([
      ['1', '', ''], // short row padded
      ['1', '2', '3'], // wide row truncated to width 3
    ]);
    expect(p.truncated).toBe(true);
  });

  it('caps columns to MAX_PASTE_COLUMNS', () => {
    const header = Array.from({ length: MAX_PASTE_COLUMNS + 5 }, (_, i) => `c${i}`).join('\t');
    const row = Array.from({ length: MAX_PASTE_COLUMNS + 5 }, (_, i) => `${i}`).join('\t');
    const p = okGrid(`${header}\n${row}`);
    expect(p.grid.headers).toHaveLength(MAX_PASTE_COLUMNS);
    expect(p.grid.rows[0]).toHaveLength(MAX_PASTE_COLUMNS);
    expect(p.truncated).toBe(true);
  });

  it('caps data rows to MAX_PASTE_ROWS', () => {
    const rows = Array.from({ length: MAX_PASTE_ROWS + 10 }, (_, i) => `${i}`).join('\n');
    const p = okGrid(`h\n${rows}`);
    expect(p.grid.rows).toHaveLength(MAX_PASTE_ROWS);
    expect(p.truncated).toBe(true);
  });

  it('clips an over-long cell', () => {
    const big = 'x'.repeat(MAX_CELL_CHARS + 50);
    const p = okGrid(`h\n${big}`);
    expect(p.grid.rows[0][0]).toHaveLength(MAX_CELL_CHARS);
    expect(p.truncated).toBe(true);
  });

  it('slices input over the byte cap', () => {
    // A single huge line of tab-separated cells; slicing keeps the work bounded.
    const huge = `h\n${'a\t'.repeat(MAX_PASTE_BYTES)}`;
    const p = okGrid(huge);
    expect(p.truncated).toBe(true);
  });
});
