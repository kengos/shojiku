// Clipboard text → a header + data grid. A NEW untrusted-input surface, so it
// is bounded before any work happens: the input is byte-capped FIRST, then
// columns/rows/cell length are hard-capped (first ones win). The delimiter
// choice is TSV-if-any-TAB (spreadsheet clipboards emit unquoted TSV),
// otherwise a quote-aware CSV state machine that cannot throw or loop.
// Framework-free. Column typing lives in `pasteColumns.ts`; the table +
// params build in `paste.ts`.

import { MAX_SCAFFOLD_FIELDS } from './scaffold';

/** Bounds — a hostile paste can never drive unbounded work or bloat the document. */
export const MAX_PASTE_BYTES = 262144; // 256 KiB of clipboard text, sliced first
export const MAX_PASTE_COLUMNS = MAX_SCAFFOLD_FIELDS; // 16 — rides the scaffold cap
export const MAX_PASTE_ROWS = 100; // data rows (the header is separate)
export const MAX_CELL_CHARS = 200; // per-cell display/store clip

export interface PasteGrid {
  /** First-row header cells (raw text — the column labels). */
  readonly headers: readonly string[];
  /** Data rows, each padded/truncated to the header width. */
  readonly rows: readonly (readonly string[])[];
}

export type PasteParseResult =
  | { readonly ok: true; readonly grid: PasteGrid; readonly truncated: boolean }
  | { readonly ok: false; readonly reason: 'empty' | 'no_columns' | 'no_rows' };

/** Which delimiter the text uses: any TAB → TSV (spreadsheet clipboards emit
 * TSV, unquoted); otherwise CSV (comma, RFC-4180-ish quoting). */
function usesTab(text: string): boolean {
  return text.includes('\t');
}

/** Split TSV: lines on any newline, cells on TAB — no quote processing (a
 * spreadsheet TSV never quotes). */
function parseTsv(text: string): string[][] {
  return text.split(/\r\n|\r|\n/).map((line) => line.split('\t'));
}

/** Parse CSV with a single-pass, quote-aware state machine. Bounded by the
 * (already byte-capped) input length; an unterminated quote absorbs the rest of
 * the text as one field rather than throwing or looping. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** Clip a cell to the length cap; returns whether it was clipped. */
function clipCell(cell: string): { readonly text: string; readonly clipped: boolean } {
  return cell.length > MAX_CELL_CHARS
    ? { text: cell.slice(0, MAX_CELL_CHARS), clipped: true }
    : { text: cell, clipped: false };
}

/** Parse clipboard text into a header + data grid, capped throughout. Fully-blank
 * rows are dropped (leading blank lines / trailing newlines), the first remaining
 * row is the header, and every data row is squared to the header width. */
export function parsePasteGrid(text: string): PasteParseResult {
  const sliced = text.length > MAX_PASTE_BYTES;
  const capped = sliced ? text.slice(0, MAX_PASTE_BYTES) : text;
  const raw = usesTab(capped) ? parseTsv(capped) : parseCsv(capped);
  let truncated = sliced;
  let clippedAny = false;
  const nonBlank = raw
    .map((cells) =>
      cells.map((cell) => {
        const { text: t, clipped } = clipCell(cell);
        clippedAny = clippedAny || clipped;
        return t;
      }),
    )
    .filter((cells) => cells.some((cell) => cell.trim() !== ''));
  if (nonBlank.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  const headerRow = nonBlank[0];
  const width = Math.min(headerRow.length, MAX_PASTE_COLUMNS);
  if (headerRow.length > MAX_PASTE_COLUMNS) {
    truncated = true;
  }
  const headers = headerRow.slice(0, width);
  if (headers.every((cell) => cell.trim() === '')) {
    return { ok: false, reason: 'no_columns' };
  }
  const dataRowsAll = nonBlank.slice(1);
  if (dataRowsAll.length === 0) {
    return { ok: false, reason: 'no_rows' };
  }
  if (dataRowsAll.length > MAX_PASTE_ROWS) {
    truncated = true;
  }
  const rows = dataRowsAll.slice(0, MAX_PASTE_ROWS).map((cells) => {
    if (cells.length > width) {
      truncated = true;
    }
    // Square to header width: pad short rows, truncate wide ones.
    return Array.from({ length: width }, (_, i) => cells[i] ?? '');
  });
  return { ok: true, grid: { headers, rows }, truncated: truncated || clippedAny };
}
