// Typing a pasted grid's columns: the display label, a charset-guarded binding
// key derived from the header (a hostile header can never inject wire grammar
// or pollute a prototype), and the inferred kind. The kind inference is a
// CLOSED switch of checks and NOTHING is ever evaluated — a formula cell (`=…`,
// `@…`) is never numeric, so such a column falls through to text and the cell
// is stored verbatim. Framework-free.

import { MAX_CELL_CHARS, type PasteGrid } from './pasteGrid';

/** Currency symbols that mark a numeric column as money. Single-char prefixes
 * plus the CJK trailing units; the code itself rides the `defaults.currency`
 * chain, so only the FORMAT is inferred here — never a currency code. */
const CURRENCY_PREFIX = '¥$€£₩₹฿₺₽¢';
const CURRENCY_SUFFIX = ['円', '元'];

/** The blank-start field kinds this import can infer (the FieldKind quintet). */
export type PasteKind = 'text' | 'number' | 'currency' | 'date' | 'boolean';

/** A resolved import column: the display label (raw header), the charset-guarded
 * binding key, and the inferred kind. */
export interface PasteColumn {
  readonly label: string;
  readonly key: string;
  readonly kind: PasteKind;
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Derive a safe binding key from a header: ASCII slug only, reserved names and
 * empties fall back to a positional `colN`, collisions dedupe. The label keeps
 * the raw header, so a Japanese/spaced header still shows verbatim. */
function deriveKey(header: string, index: number, used: Set<string>): string {
  const slug = header.trim().replace(/[^A-Za-z0-9_]+/g, '_');
  const cleaned = slug.replace(/^_+|_+$/g, '');
  // Reject an empty/underscore-only slug and any reserved name — checking the
  // pre-strip slug too, so `__proto__` (which would strip to `proto`) still
  // falls back rather than sneaking a near-reserved key through.
  let key =
    cleaned === '' || RESERVED_KEYS.has(cleaned) || RESERVED_KEYS.has(slug)
      ? `col${index + 1}`
      : cleaned;
  if (used.has(key)) {
    let n = 2;
    while (used.has(`${key}_${n}`)) {
      n += 1;
    }
    key = `${key}_${n}`;
  }
  used.add(key);
  return key;
}

const DATE_RE = /^\d{4}[-/]\d{2}[-/]\d{2}$/;

/** A numeric-or-money cell → its number + whether a currency symbol was present.
 * A leading `=`/`+`/`@` (formula/injection markers) is never numeric, so such a
 * column falls through to text and the cell is stored verbatim — no evaluation. */
function parseMoneyish(cell: string): { readonly num: number; readonly hadSymbol: boolean } | null {
  let s = cell.trim();
  if (s === '' || s.startsWith('=') || s.startsWith('@')) {
    return null;
  }
  let hadSymbol = false;
  if (CURRENCY_PREFIX.includes(s[0])) {
    hadSymbol = true;
    s = s.slice(1).trim();
  }
  for (const suffix of CURRENCY_SUFFIX) {
    if (s.endsWith(suffix)) {
      hadSymbol = true;
      s = s.slice(0, -suffix.length).trim();
    }
  }
  if (CURRENCY_PREFIX.includes(s[s.length - 1])) {
    hadSymbol = true;
    s = s.slice(0, -1).trim();
  }
  const stripped = s.replace(/,/g, '').replace(/\s/g, '');
  if (stripped === '' || !/^[+-]?\d*\.?\d+$/.test(stripped)) {
    return null;
  }
  const num = Number(stripped);
  return Number.isFinite(num) ? { num, hadSymbol } : null;
}

/** Infer a column's kind from its NON-blank data cells (a closed switch of
 * checks, never a hostile-string table walk). Empty → text. */
export function inferKind(cells: readonly string[]): PasteKind {
  const values = cells.map((c) => c.trim()).filter((c) => c !== '');
  if (values.length === 0) {
    return 'text';
  }
  if (values.every((v) => /^(true|false)$/i.test(v))) {
    return 'boolean';
  }
  if (values.every((v) => DATE_RE.test(v))) {
    return 'date';
  }
  const money = values.map(parseMoneyish);
  if (money.every((m) => m !== null)) {
    return money.some((m) => m?.hadSymbol) ? 'currency' : 'number';
  }
  return 'text';
}

/** Coerce one raw cell to its column's typed value. Blank → null for the typed
 * kinds (an absent value), '' for text. Nothing is evaluated. */
export function coerceCell(raw: string, kind: PasteKind): unknown {
  const trimmed = raw.trim();
  if (kind === 'text') {
    return raw.slice(0, MAX_CELL_CHARS);
  }
  if (trimmed === '') {
    return null;
  }
  switch (kind) {
    case 'boolean':
      return /^true$/i.test(trimmed);
    case 'date':
      return trimmed.replace(/\//g, '-');
    case 'number':
    case 'currency':
      return parseMoneyish(trimmed)?.num ?? null;
  }
}

/** Resolve every column (label / derived key / inferred kind). Shared by the
 * dialog preview and the scaffold build so they never disagree. */
export function analyzeColumns(grid: PasteGrid): readonly PasteColumn[] {
  const used = new Set<string>();
  return grid.headers.map((header, index) => {
    const cells = grid.rows.map((row) => row[index] ?? '');
    return { label: header.trim(), key: deriveKey(header, index, used), kind: inferKind(cells) };
  });
}
