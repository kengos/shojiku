// Ruby (furigana) on a text item: `ruby: [{ base, text }]` and `rubySize`, read
// and written as authored. The wire is `RubyPair` in
// `engine/core/src/template/ruby.rs` — both strings REQUIRED and verbatim (no
// `{key}` interpolation), matched by layout against the DRAWN text in listed
// order, each search starting after the previous match
// (`engine/layout/src/engine/text/ruby.rs::match_entries`). Only `TextItem`
// carries the two keys; `char_grid`'s `rubySize` is its own item key
// (`charGridInk.ts`).
//
// READ degrades rather than throws, like every panel model, and keeps ABSENT
// apart from UNREADABLE: a `ruby` that is present but not a list is
// `unreadable` (shown, and clearable), an entry the engine could not parse — not
// a map, a missing or non-string side, or any other key (`RubyPair` is
// `deny_unknown_fields`) — is a row with `readable: false` (so every other row
// keeps its true index), and a
// present `rubySize` that is neither a string nor a number is flagged so its
// field can still remove it.
//
// WRITE refuses — returns `null`, dispatches nothing — rather than author a value
// the engine skips with a warning: an empty base or reading
// (`empty_ruby_entry`), one over the per-entry cap (`ruby_entry_too_long`), an
// entry past the list cap (`too_many_ruby_entries`). `rubyWire.test.ts` reads
// both caps from the engine source.

import type { Op, ReadFn } from '@shojiku/designer-core';
import { readItem } from '../text/declModel';
import { display, record } from './itemView';

/** The engine capability an older build lacks — it rejects `ruby` at PARSE. */
export const RUBY_CAPABILITY = 'text.ruby';

/** `MAX_RUBY_ENTRIES` (engine/core/src/template/ruby.rs). */
export const MAX_RUBY_ENTRIES = 256;

/** `MAX_RUBY_LEN` (engine/core/src/ruby.rs), counted in CHARS — Rust's
 * `chars().count()`, so one code point each, a surrogate pair included. */
export const MAX_RUBY_CHARS = 64;

export type RubyField = 'base' | 'text';

export interface RubyRow {
  /** The entry's index in the authored list (true even past a hostile entry). */
  readonly index: number;
  readonly base: string;
  readonly text: string;
  /** `false` for an entry the engine cannot parse: not a map, or a `base` /
   * `text` that is missing or not a string. Its inputs are not offered. */
  readonly readable: boolean;
}

export interface RubyView {
  readonly state: 'absent' | 'list' | 'unreadable';
  readonly rows: readonly RubyRow[];
  /** The authored `rubySize` as written (`''` = unset or unreadable). */
  readonly size: string;
  /** A `rubySize` is present but reads as nothing (not a non-empty string or a
   * number), so the field must still be able to remove it. */
  readonly sizeUnreadable: boolean;
}

function ownString(rec: Record<string, unknown>, key: RubyField): string | null {
  return Object.hasOwn(rec, key) && typeof rec[key] === 'string' ? (rec[key] as string) : null;
}

function readRow(entry: unknown, index: number): RubyRow {
  const rec = record(entry);
  if (rec !== undefined && Object.keys(rec).some((key) => key !== 'base' && key !== 'text')) {
    return { index, base: '', text: '', readable: false };
  }
  const base = rec === undefined ? null : ownString(rec, 'base');
  const text = rec === undefined ? null : ownString(rec, 'text');
  return base === null || text === null
    ? { index, base: '', text: '', readable: false }
    : { index, base, text, readable: true };
}

/** What the section's entry rows need: where they write, what they read, and
 * the one refusal they report (an entry over the per-entry cap). */
export interface RubyRowsContext {
  readonly path: string;
  readonly view: RubyView;
  readonly dispatch: (op: Op | null) => void;
  /** Report an entry refused for its length (`true`), or clear the report. */
  readonly onTooLong: (tooLong: boolean) => void;
}

/** The ruby list and size of the item at `path`. */
export function readRuby(read: ReadFn, path: string): RubyView {
  const item = readItem(read, path) ?? {};
  const sizeRaw = Object.hasOwn(item, 'rubySize') ? item.rubySize : undefined;
  const size = display(sizeRaw);
  // Present but showing nothing: a map, a list, a null, or an empty string —
  // none of which the engine parses as a length.
  const sizeUnreadable = sizeRaw !== undefined && size === '';
  if (!Object.hasOwn(item, 'ruby')) {
    return { state: 'absent', rows: [], size, sizeUnreadable };
  }
  const raw = item.ruby;
  return Array.isArray(raw)
    ? { state: 'list', rows: raw.map(readRow), size, sizeUnreadable }
    : { state: 'unreadable', rows: [], size, sizeUnreadable };
}

/** A base or reading the engine applies: non-empty (verbatim — the engine
 * rejects only the empty string) and within the per-entry char cap. */
export function rubyStringAccepted(value: string): boolean {
  return value !== '' && [...value].length <= MAX_RUBY_CHARS;
}

/** Whether another entry can be added (the list is readable and under the cap). */
export function rubyAddable(view: RubyView): boolean {
  return view.state !== 'unreadable' && view.rows.length < MAX_RUBY_ENTRIES;
}

/** A new entry, appended (listed order is the match order). An absent list is
 * created with the entry in it. */
export function addRubyOp(path: string, view: RubyView, base: string, text: string): Op | null {
  if (!rubyAddable(view) || !rubyStringAccepted(base) || !rubyStringAccepted(text)) {
    return null;
  }
  const value = { base, text };
  return view.state === 'absent'
    ? { op: 'putValue', path, keys: ['ruby'], value: [value] }
    : { op: 'insertItem', path: `${path}.ruby`, index: view.rows.length, value };
}

/** One field of one entry: a TARGETED op on that entry, so its siblings keep
 * their bytes. Refused when unchanged, empty (removal is the row's own button),
 * over the cap, or when the entry is unreadable. */
export function editRubyOp(path: string, row: RubyRow, field: RubyField, next: string): Op | null {
  if (!row.readable || next === row[field] || !rubyStringAccepted(next)) {
    return null;
  }
  return { op: 'setScalar', path: `${path}.ruby[${row.index}]`, keys: [field], value: next };
}

/** Removes one entry; the last one takes the key with it, so no `ruby: []` is
 * left behind. Works on an unreadable entry too. */
export function removeRubyOp(path: string, view: RubyView, index: number): Op {
  return view.rows.length <= 1
    ? { op: 'removeKey', path, keys: ['ruby'] }
    : { op: 'removeItem', path: `${path}.ruby`, index };
}

/** Clears a `ruby` that is not a list (the unreadable state). */
export function clearRubyOp(path: string): Op {
  return { op: 'removeKey', path, keys: ['ruby'] };
}

/** A positive bare number (pt). */
const NUMERAL = /^\d+(?:\.\d+)?$/;
/** A positive unit length. `%` is deliberately absent: the engine resolves a
 * percentage `rubySize` against the PARENT WIDTH (`resolve_x`), never the font
 * size, so `50%` draws an enormous reading. `em` is the INHERITED font size. */
const SIZE_LENGTH = /^(\d+(?:\.\d+)?)(?:pt|mm|cm|in|em|rem)$/;
/** A value longer than this is refused rather than written (a hostile paste). */
const MAX_SIZE_CHARS = 16;

/** A committed `rubySize` entry. Empty removes an authored (or unreadable) value
 * — the engine default is half the font size; a positive length is written
 * (a bare number as pt); anything else is refused: `%` (see above), zero or a
 * sign (they parse, and layout silently swaps in the default), and garbage
 * (a whole-document parse error). Unchanged is no edit. */
export function rubySizeOp(path: string, view: RubyView, entry: string): Op | null {
  const text = entry.trim();
  const keys = ['rubySize'];
  if (text === '') {
    return view.size === '' && !view.sizeUnreadable ? null : { op: 'removeKey', path, keys };
  }
  if (text === view.size || text.length > MAX_SIZE_CHARS) {
    return null;
  }
  if (NUMERAL.test(text)) {
    return Number(text) > 0 ? { op: 'setScalar', path, keys, value: Number(text) } : null;
  }
  const unit = SIZE_LENGTH.exec(text);
  return unit !== null && Number(unit[1]) > 0 ? { op: 'setScalar', path, keys, value: text } : null;
}
