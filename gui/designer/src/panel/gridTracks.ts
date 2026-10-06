// What the DOCUMENT says about a grid's column widths and row heights, and the
// named ops that change them. The wire (docs/engine/grid.md): `box.columns` /
// `box.rows` is a COUNT (equal tracks) or a track LIST whose entries are a number
// (pt), a Length string (`"30mm"`, `"25%"`), an `fr` share (`"2fr"`) or `"auto"`
// (a column as wide as its content; a row as tall as its tallest cell — what an
// absent `rows` already means). 1..=64 tracks per axis.
//
// An entry edit replaces ONE sequence entry (removeItem + insertItem at its
// index, one batch) rather than rewriting the list, so the other entries — and
// their comments — stay byte-for-byte. An entry the panel cannot classify shows
// as a fixed width carrying its text verbatim and is only rewritten when the
// user edits it.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { isRelativeLength, readLength } from '../canvas/lengths';
import { MAX_GRID_TRACKS } from './layoutModel';
import { MAX_FLEX_GROW, MAX_GAP_PT } from './layoutOps';

export type TrackAxis = 'columns' | 'rows';
export type TrackKind = 'auto' | 'fr' | 'fixed';

export interface Track {
  readonly kind: TrackKind;
  /** The value field's text: the `fr` weight (`"2"`), the fixed length as
   * authored (`"90"`, `"30mm"`), `''` for `auto`. */
  readonly value: string;
}

/** The axis as authored: absent, a count, or a track list. */
export type TrackSpec =
  | { readonly form: 'unset' }
  | { readonly form: 'count'; readonly count: number }
  | { readonly form: 'list'; readonly tracks: readonly Track[] };

/** An ABSOLUTE fixed track's ceiling — the gap cap, so a hostile paste cannot
 * land an absurd length in the wire. A relative one (`%`, `em`, `rem`) resolves
 * against the grid and is passed through as typed. */
export const MAX_TRACK_PT = MAX_GAP_PT;

/** The default a kind change writes (Gate A): a share of 1, a 100pt track. */
const KIND_DEFAULTS: Readonly<Record<TrackKind, string | number>> = {
  auto: 'auto',
  fr: '1fr',
  fixed: 100,
};

function readTrack(entry: unknown): Track {
  if (typeof entry === 'number') {
    return { kind: 'fixed', value: String(entry) };
  }
  if (typeof entry !== 'string') {
    return { kind: 'fixed', value: '' };
  }
  const text = entry.trim();
  if (text === 'auto') {
    return { kind: 'auto', value: '' };
  }
  if (text.endsWith('fr')) {
    return { kind: 'fr', value: text.slice(0, -2).trim() };
  }
  return { kind: 'fixed', value: entry };
}

/** The axis value as the editor shows it, or `null` when it is neither a count
 * nor a non-empty list (a hostile value gets no editor). Clamped to the cap. */
export function readTracks(value: unknown): TrackSpec | null {
  if (value === undefined) {
    return { form: 'unset' };
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return { form: 'count', count: Math.min(MAX_GRID_TRACKS, Math.floor(value)) };
  }
  if (Array.isArray(value) && value.length > 0) {
    return { form: 'list', tracks: value.slice(0, MAX_GRID_TRACKS).map(readTrack) };
  }
  return null;
}

/** How many tracks the axis has: a count, a list's length, or 1 when absent
 * (the engine default for columns; for rows the caller supplies its own). */
export function trackCount(spec: TrackSpec): number {
  if (spec.form === 'count') {
    return spec.count;
  }
  return spec.form === 'list' ? spec.tracks.length : 1;
}

const axisKeys = (axis: TrackAxis) => ['box', axis];
const seqPath = (path: string, axis: TrackAxis) => `${path}.box.${axis}`;

/** Switch the axis to `to` over `n` tracks (the count the grid shows now): a
 * count of `n`; a list of `n` equal shares (columns — the same look as the
 * count) or `n` content-sized rows; or, for rows, no key at all. */
export function trackFormOp(path: string, axis: TrackAxis, to: TrackSpec['form'], n: number): Op {
  const keys = axisKeys(axis);
  const count = Math.min(MAX_GRID_TRACKS, Math.max(1, Math.floor(n)));
  if (to === 'unset') {
    return { op: 'removeKey', path, keys };
  }
  if (to === 'count') {
    return { op: 'setScalar', path, keys, value: count };
  }
  const entry = axis === 'columns' ? '1fr' : 'auto';
  return { op: 'putValue', path, keys, value: Array.from({ length: count }, () => entry) };
}

function replaceEntry(path: string, axis: TrackAxis, index: number, value: SnippetValue): Op[] {
  const at = seqPath(path, axis);
  return [
    { op: 'removeItem', path: at, index },
    { op: 'insertItem', path: at, index, value },
  ];
}

/** Change entry `index` to another kind, at that kind's default. */
export function trackKindOps(path: string, axis: TrackAxis, index: number, kind: TrackKind): Op[] {
  return replaceEntry(path, axis, index, KIND_DEFAULTS[kind]);
}

/** The wire entry a typed value becomes, or `null` when refused: an `fr`
 * weight finite in [0, MAX_FLEX_GROW]; a fixed length that is a non-negative
 * absolute length ≤ MAX_TRACK_PT or a non-negative relative one (`%`, `em`,
 * `rem`). */
export function trackEntry(kind: TrackKind, raw: string): string | number | null {
  const text = raw.trim();
  if (kind === 'fr') {
    const weight = Number(text);
    return text !== '' && Number.isFinite(weight) && weight >= 0 && weight <= MAX_FLEX_GROW
      ? `${weight}fr`
      : null;
  }
  if (kind === 'auto' || text.startsWith('-')) {
    return null;
  }
  const length = readLength(text);
  if (length === null) {
    return isRelativeLength(text) ? text : null;
  }
  if (length.pt > MAX_TRACK_PT) {
    return null;
  }
  return length.unit === null ? length.pt : text;
}

/** Commit a typed value to entry `index`; `null` when refused. */
export function trackValueOps(
  path: string,
  axis: TrackAxis,
  index: number,
  kind: TrackKind,
  raw: string,
): Op[] | null {
  const entry = trackEntry(kind, raw);
  return entry === null ? null : replaceEntry(path, axis, index, entry);
}

/** The track list ops that follow a column/row count change on a LIST: copies
 * of the last entry appended, or trailing entries dropped. `raw` is the list as
 * authored (copies keep the last entry's exact spelling). */
export function trackListResizeOps(
  path: string,
  axis: TrackAxis,
  raw: readonly unknown[],
  target: number,
): Op[] {
  const at = seqPath(path, axis);
  const ops: Op[] = [];
  const last = raw[raw.length - 1] as SnippetValue;
  for (let i = raw.length; i < target; i++) {
    ops.push({ op: 'insertItem', path: at, index: i, value: last });
  }
  for (let i = raw.length - 1; i >= target; i--) {
    ops.push({ op: 'removeItem', path: at, index: i });
  }
  return ops;
}
