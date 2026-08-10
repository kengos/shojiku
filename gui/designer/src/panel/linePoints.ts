// Pure model for a `line` item's GEOMETRY — its `from`/`to` endpoints. A line
// has no `box`, so the placement tab's box fields cannot express it (and
// authoring a `box:` key on a line is an engine parse error); these four
// values are the only position a line has.
//
// An endpoint is EITHER coordinates (`{ x, y }`, both required) or an anchor
// to another item (`{ item, edge? }`) — never a mix, and the engine refuses
// the mix at parse. So there is no "remove the key" state within an arm: an
// empty or unparseable entry is REFUSED, leaving the document as it was, and
// switching arms reconciles BOTH sides' keys in one transactional op (a stale
// `x` left beside an `item` is exactly the shape the engine rejects).
// Writes keep the authored form — a bare number stays a number (pt), a
// suffixed string stays that string — so an untouched file stays byte-exact.
//
// The view is read from the WIRE (does this endpoint carry `item`?), never
// from a UI mode flag, so an externally-authored document displays honestly.

import type { Op, ReadFn } from '@shojiku/designer-core';

/** Which endpoint value a field edits. `from`/`to` × `x`/`y`. */
export const LINE_POINT_FIELDS = ['from.x', 'from.y', 'to.x', 'to.y'] as const;
export type LinePointField = (typeof LINE_POINT_FIELDS)[number];

/** The anchored arm's fields, in the same `<end>.<key>` grammar. */
export const LINE_ANCHOR_FIELDS = ['from.item', 'from.edge', 'to.item', 'to.edge'] as const;
export type LineAnchorField = (typeof LINE_ANCHOR_FIELDS)[number];

export type LineEnd = 'from' | 'to';

/** The engine's `<anchor-side>` subset; `''` reads as the `center` default. */
export const LINE_EDGES = ['top', 'right', 'bottom', 'left', 'center'] as const;

/** Every endpoint value as authored text (`''` when unset, or when the
 * document carries something this panel will not display — a map, a
 * non-finite number). Both arms are present; which one is LIVE is read from
 * `item` being non-empty, never from a mode flag. */
export type LinePointsView = Readonly<Record<LinePointField | LineAnchorField, string>> & {
  /** Whether each endpoint authors an `offset:` map. Not a text field — the
   * panel does not edit it — but the arm switch must know, because removing
   * a key the document does not carry REFUSES the whole op batch, and the
   * batch is what makes the switch one undo step. */
  readonly offsets: Readonly<Record<LineEnd, boolean>>;
  /** Whether each endpoint carries an `item:` key AT ALL — which is not the
   * same as `item` reading as non-empty. An id this panel will not display
   * (over-long, or outside the id grammar) still makes the endpoint
   * anchored, and treating it as coordinates would both misreport the
   * document and let the arm switch overwrite an id the user never saw. */
  readonly anchored: Readonly<Record<LineEnd, boolean>>;
};

/** Whether `end` is authored as an anchor. */
export function isAnchored(view: LinePointsView, end: LineEnd): boolean {
  return view.anchored[end];
}

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
function keysOf(field: LinePointField | LineAnchorField): string[] {
  return field.split('.');
}

/** An authored id or edge keyword as display text. Bounded and
 * character-restricted: the value is echoed into the panel and written back
 * into the document, so a hostile string is shown as unset rather than
 * round-tripped. */
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function nameText(raw: unknown): string {
  return typeof raw === 'string' && ID_RE.test(raw) ? raw : '';
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
  const at = (end: LineEnd, axis: 'x' | 'y'): string => pointText(record(item[end])?.[axis]);
  const name = (end: LineEnd, key: 'item' | 'edge'): string => nameText(record(item[end])?.[key]);
  return {
    'from.x': at('from', 'x'),
    'from.y': at('from', 'y'),
    'to.x': at('to', 'x'),
    'to.y': at('to', 'y'),
    'from.item': name('from', 'item'),
    'from.edge': name('from', 'edge'),
    'to.item': name('to', 'item'),
    'to.edge': name('to', 'edge'),
    offsets: {
      from: record(item.from)?.offset !== undefined,
      to: record(item.to)?.offset !== undefined,
    },
    anchored: {
      from: record(item.from)?.item !== undefined,
      to: record(item.to)?.item !== undefined,
    },
  };
}

/** Switch one endpoint between the two arms, reconciling BOTH sides' keys in
 * ONE op list — so it is one undo step and the document is never momentarily
 * in the mixed shape the engine rejects. Coordinates default to 0/0, the
 * anchor to the given id with an unauthored (`center`) edge. */
export function lineArmOps(
  path: string,
  view: LinePointsView,
  end: LineEnd,
  to: 'xy' | 'anchor',
  item = '',
): Op[] {
  const drop = (key: string): Op => ({ op: 'removeKey', path, keys: [end, key] });
  const set = (key: string, value: string | number): Op => ({
    op: 'setScalar',
    path,
    keys: [end, key],
    value,
  });
  // Only keys the document actually carries: removing an absent one refuses
  // the batch, which would leave the mixed shape the engine rejects.
  const authored = (key: LineAnchorField | LinePointField): Op[] =>
    view[key] === '' ? [] : [drop(key.split('.')[1])];
  return to === 'xy'
    ? [
        // Keyed on the WIRE, not the display text: an id the panel refuses
        // to show is still an id, and leaving it behind beside a fresh
        // `x`/`y` is the mixed shape the engine rejects.
        ...(view.anchored[end] ? [drop('item')] : []),
        ...authored(`${end}.edge`),
        ...(view.offsets[end] ? [drop('offset')] : []),
        set('x', 0),
        set('y', 0),
      ]
    : [...authored(`${end}.x`), ...authored(`${end}.y`), set('item', item)];
}

/** The ops for an anchored field's commit, or `[]` when nothing should
 * change. An empty `edge` REMOVES the key (its absence is the `center`
 * default, and writing `center` would churn an authored file); an empty
 * `item` is refused — the arm has no meaning without a target. */
export function lineAnchorOps(
  path: string,
  view: LinePointsView,
  field: LineAnchorField,
  next: string,
): Op[] {
  const text = next.trim();
  if (text === view[field]) {
    return [];
  }
  const keys = keysOf(field);
  if (text === '') {
    return field.endsWith('.edge') ? [{ op: 'removeKey', path, keys }] : [];
  }
  if (!ID_RE.test(text)) {
    return [];
  }
  if (field.endsWith('.edge') && !LINE_EDGES.includes(text as (typeof LINE_EDGES)[number])) {
    return [];
  }
  return [{ op: 'setScalar', path, keys, value: text }];
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
