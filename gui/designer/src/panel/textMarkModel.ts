// A circle around a text item's glyphs: `mark: { data?, padding?, styleNames?,
// style? }` on a `text`. The wire is `TextMark` in
// `engine/core/src/template/marks.rs` — every field optional, so a bare
// `mark: {}` is an oval that always draws, and `data:` is the SAME presence
// binding an `ellipse` takes, which is why the binding half is `markModel` /
// `markOps` pointed at `<item>.mark` rather than a second copy.
//
// READ degrades rather than throws and keeps ABSENT apart from UNREADABLE: a
// missing or `null` key is no circle (serde reads `null` as `None`), any other
// non-map is `unreadable` — shown, and clearable, never edited in place.
//
// WRITE is one batch per switch, so each is one undo step. The presence switches
// write at the ITEM (`mark` itself appears and disappears); everything inside the
// mark writes at `<item>.mark`, which only exists while the mark does — an op
// there over an absent mark is refused by the document, so the section mounts
// those controls only for a map. Dropping the binding removes `data` and keeps
// the mark: `removeKey` prunes the maps named in its `keys`, never the map at its
// `path`, so `mark: {}` (always draws) is what is left.
//
// The clearance (`padding`) is a Length the engine resolves against the TEXT'S
// FONT SIZE — `%`, `em` and `rem` alike (`pad_pt` in
// `engine/layout/src/engine/text/mark.rs`) — defaulting to 0.4 × the font size.
// A negative one is honoured there (the oval shrinks into the glyphs, floored at
// 0.5 pt); the panel refuses it, by the user's decision, rather than offer a
// value that cuts the text it is meant to circle.

import type { Op, ReadFn, SnippetValue } from '@shojiku/designer-core';
import { readItem } from '../text/declModel';
import { display, record } from './itemView';
import { readMark } from './markModel';
import { bindMarkOps, unbindMarkOps } from './markOps';

/** The engine capability an older build lacks — it rejects `mark` at PARSE. */
export const TEXT_MARK_CAPABILITY = 'text.mark';

/** `DEFAULT_PAD_EM` (engine/layout/src/engine/text/mark.rs), as the panel names
 * the unset clearance. */
export const DEFAULT_MARK_PADDING = '0.4em';

/** Clearances worth offering, beside the unset default. Font-relative, like the
 * default, so a preset keeps its look when the text's size changes. */
export const MARK_PADDING_PRESETS = ['0', '0.2em', '0.6em', '1em'] as const;

/** Whether the item draws a circle, and when. */
export type TextMarkPresence = 'none' | 'always' | 'bound';

export interface TextMarkView {
  readonly state: 'absent' | 'map' | 'unreadable';
  /** Where everything inside the mark is written. */
  readonly markPath: string;
  readonly presence: TextMarkPresence;
  /** The authored `padding` as written (`''` = unset or unreadable). */
  readonly padding: string;
  /** A `padding` is present but reads as nothing (not a string or a number), so
   * the field must still be able to remove it. */
  readonly paddingUnreadable: boolean;
  /** The mark's own `styleNames`, strings only. */
  readonly styleNames: readonly string[];
}

/** A display string a hostile document can put in the field is cut here. */
const MAX_DISPLAY = 40;

/** The circle of the text item at `path`. */
export function readTextMark(read: ReadFn, path: string): TextMarkView {
  const markPath = `${path}.mark`;
  const item = readItem(read, path) ?? {};
  const raw = Object.hasOwn(item, 'mark') ? item.mark : undefined;
  const absent: TextMarkView = {
    state: 'absent',
    markPath,
    presence: 'none',
    padding: '',
    paddingUnreadable: false,
    styleNames: [],
  };
  if (raw === undefined || raw === null) {
    return absent;
  }
  const mark = record(raw);
  if (mark === undefined) {
    return { ...absent, state: 'unreadable' };
  }
  // `null` is the engine's `None` — the default clearance — not an unreadable one.
  const paddingRaw = Object.hasOwn(mark, 'padding') ? (mark.padding ?? undefined) : undefined;
  const shown = display(paddingRaw);
  const names = Object.hasOwn(mark, 'styleNames') ? mark.styleNames : undefined;
  return {
    state: 'map',
    markPath,
    presence: readMark(read, markPath).mode === 'bound' ? 'bound' : 'always',
    padding: shown.length > MAX_DISPLAY ? `${shown.slice(0, MAX_DISPLAY)}…` : shown,
    paddingUnreadable: paddingRaw !== undefined && shown === '',
    styleNames: Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [],
  };
}

/** A presence switch, as ONE batch. Unchanged authors nothing (`[]`). Turning
 * the circle off removes the whole mark — its clearance and outline with it,
 * restored together by one undo. */
export function textMarkPresenceOps(
  path: string,
  view: TextMarkView,
  next: TextMarkPresence,
): readonly Op[] {
  if (next === view.presence || view.state === 'unreadable') {
    return [];
  }
  if (next === 'none') {
    return [clearTextMarkOp(path)];
  }
  if (view.state === 'absent') {
    const value: SnippetValue = next === 'bound' ? { data: { key: '' } } : {};
    return [{ op: 'putValue', path, keys: ['mark'], value }];
  }
  return next === 'bound'
    ? bindMarkOps(view.markPath, false)
    : unbindMarkOps(view.markPath, false, false);
}

/** Removes the mark — the way out of the unreadable state, and "no circle". */
export function clearTextMarkOp(path: string): Op {
  return { op: 'removeKey', path, keys: ['mark'] };
}

/** A non-negative bare number: points. */
const NUMERAL = /^\d+(?:\.\d+)?$/;
/** A non-negative length in a unit the engine parses. A sign never matches. */
const PADDING_LENGTH = /^\d+(?:\.\d+)?(?:pt|mm|cm|in|em|rem|%)$/;
/** A value longer than this is refused rather than written (a hostile paste). */
const MAX_PADDING_CHARS = 16;

/** `MAX_RESOLVED_PT` (engine/layout-box/src/resolve.rs): past it `pad_pt` silently
 * swaps in the default, so the field would show a clearance the page does not use. */
export const MAX_PADDING_PT = 1_000_000;

/** Points per unit for the ABSOLUTE forms (`PhysicalUnit::pt_per_unit`). The
 * font-relative ones (`em`/`rem`/`%`) depend on the size and are not bounded here. */
const PT_PER_UNIT: Readonly<Record<string, number>> = {
  '': 1,
  pt: 1,
  mm: 72 / 25.4,
  cm: 720 / 25.4,
  in: 72,
};

/** Whether an accepted entry stays inside what the engine draws. */
function withinBound(text: string): boolean {
  const [, number, unit] = /^([\d.]+)(.*)$/.exec(text) as RegExpExecArray;
  const factor = PT_PER_UNIT[unit];
  return factor === undefined || Number(number) * factor <= MAX_PADDING_PT;
}

/** A committed clearance. Empty removes an authored (or unreadable) one — the
 * engine default is 0.4 × the font size; a non-negative length is written (a
 * bare number as a NUMBER, the pt wire form); anything else is refused: a sign
 * (by decision, see the header), garbage (a whole-document parse error), and an
 * absolute length past `MAX_PADDING_PT` (the engine draws the default instead).
 * Unchanged is no edit. Only offered while the mark is a map. */
export function markPaddingOp(view: TextMarkView, entry: string): Op | null {
  const text = entry.trim();
  const path = view.markPath;
  const keys = ['padding'];
  if (text === '') {
    return view.padding === '' && !view.paddingUnreadable ? null : { op: 'removeKey', path, keys };
  }
  if (text === view.padding || text.length > MAX_PADDING_CHARS) {
    return null;
  }
  if (!PADDING_LENGTH.test(text) && !NUMERAL.test(text)) {
    return null;
  }
  if (!withinBound(text)) {
    return null;
  }
  if (NUMERAL.test(text)) {
    return { op: 'setScalar', path, keys, value: Number(text) };
  }
  return { op: 'setScalar', path, keys, value: text };
}
