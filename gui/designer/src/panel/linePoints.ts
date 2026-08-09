// Pure model for a `line` item's GEOMETRY — its `from`/`to` endpoints. A line
// has no `box`, so the placement tab's box fields cannot express it (and
// authoring a `box:` key on a line is an engine parse error); these four
// values are the only position a line has.
//
// Both endpoints are REQUIRED on the wire (`PointSpec { x, y }`, neither
// optional), so unlike a style property there is no "remove the key" state:
// an empty or unparseable entry is REFUSED, leaving the document as it was.
// Writes keep the authored form — a bare number stays a number (pt), a
// suffixed string stays that string — so an untouched file stays byte-exact.

import type { Op, ReadFn } from '@shojiku/designer-core';

/** Which endpoint value a field edits. `from`/`to` × `x`/`y`. */
export const LINE_POINT_FIELDS = ['from.x', 'from.y', 'to.x', 'to.y'] as const;
export type LinePointField = (typeof LINE_POINT_FIELDS)[number];

/** The four endpoint values as authored text (`''` when the document carries
 * something this panel will not display — a map, a non-finite number). */
export type LinePointsView = Readonly<Record<LinePointField, string>>;

// The engine's own length grammar (`parse_length_text`): a bare number is pt,
// or a numeral with one of these suffixes. Anchored and linear, and bounded
// against a hostile authored value.
const MAX_LENGTH_CHARS = 32;
const LENGTH_RE = /^-?\d+(?:\.\d+)?(%|pt|mm|cm|in|rem|em)?$/;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An authored endpoint value as its display text: a finite number verbatim,
 * an accepted length string verbatim, anything else empty (the field reads as
 * unset rather than showing a shape it cannot write back). */
function pointText(raw: unknown): string {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : '';
  }
  if (typeof raw !== 'string') {
    return '';
  }
  const trimmed = raw.trim();
  return trimmed.length <= MAX_LENGTH_CHARS && LENGTH_RE.test(trimmed) ? trimmed : '';
}

/** The keys a field addresses, as the op's `keys` path. */
function keysOf(field: LinePointField): string[] {
  return field.split('.');
}

/** Read the line's endpoints at `path`. Never throws: a hostile document
 * shape reads as four empty fields rather than failing the panel render. */
export function readLinePoints(read: ReadFn, path: string): LinePointsView {
  let item: Record<string, unknown> = {};
  try {
    item = record(read(path)) ?? {};
  } catch {
    // Fall through to the empty view.
  }
  const at = (end: 'from' | 'to', axis: 'x' | 'y'): string => pointText(record(item[end])?.[axis]);
  return {
    'from.x': at('from', 'x'),
    'from.y': at('from', 'y'),
    'to.x': at('to', 'x'),
    'to.y': at('to', 'y'),
  };
}

/** The ops for one field's commit, or `[]` when nothing should change:
 * unchanged text, an empty entry (the key is required — there is nothing to
 * remove it to), or a value outside the engine's length grammar. Refusing
 * rather than writing keeps a typo from turning a drawable line into a
 * document that will not parse. */
export function linePointOps(
  path: string,
  view: LinePointsView,
  field: LinePointField,
  next: string,
): Op[] {
  const text = next.trim();
  if (text === view[field] || text === '') {
    return [];
  }
  if (text.length > MAX_LENGTH_CHARS || !LENGTH_RE.test(text)) {
    return [];
  }
  // A unitless numeral commits as a NUMBER — the engine's bare-number pt form,
  // and what every existing template carries. No finiteness re-check is
  // needed: the regex admits only a plain decimal numeral of ≤32 chars
  // (≤1e32), so `Number` is always finite here — the same reasoning
  // `canvas/lengths.ts` states for its own parse.
  const bare = /^-?\d+(?:\.\d+)?$/.test(text);
  return [{ op: 'setScalar', path, keys: keysOf(field), value: bare ? Number(text) : text }];
}
