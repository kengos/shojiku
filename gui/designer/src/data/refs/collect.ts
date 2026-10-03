// The recording half of the reference walk: how one leaf becomes `DataRef`s.
// A key-valued leaf is one reference; an interpolated string is one per distinct
// `{key}` it holds (a declared `{name}` is skipped — it reads the declaration,
// which is recorded where it is declared). `walk.ts` decides WHICH leaves an
// item has and the frame each resolves under; this file only records.

import { MAX_TEXT_EXPRS, parseRawSegments } from '../../text/interpolate';
import { type Carrier, type DataRef, NO_SHADOW, type RefOwner } from './types';

/** The walk's mutable state: the references so far and whether a bound cut
 * the walk short. */
export interface Sink {
  readonly refs: DataRef[];
  truncated: boolean;
  items: number;
}

/** What every reference an item records shares. */
export interface Site {
  readonly owner: RefOwner;
  readonly detail: string | null;
  readonly frame: readonly string[];
  readonly shadow: ReadonlySet<string>;
}

/** The distinct `{key}`s of one string, undeclared names only. A string holding
 * `MAX_TEXT_EXPRS` expressions or more marks the walk truncated: past that the
 * GUI parser reads further ones as literals while the engine keeps
 * interpolating them, so references may sit where this scan cannot see. */
export function inlineKeys(sink: Sink, text: string, shadow: ReadonlySet<string>): string[] {
  if (!text.includes('{')) {
    return [];
  }
  const keys = new Set<string>();
  let exprs = 0;
  for (const segment of parseRawSegments(text)) {
    if (segment.kind === 'expr') {
      exprs += 1;
      if (!shadow.has(segment.key)) {
        keys.add(segment.key);
      }
    }
  }
  if (exprs >= MAX_TEXT_EXPRS) {
    sink.truncated = true;
  }
  return [...keys];
}

/** Record a key-valued leaf (`data.key`, `visible.key`, a declaration's `key`). */
export function recordWhole(
  sink: Sink,
  site: Site,
  path: string,
  keys: readonly string[],
  value: unknown,
  carrier: Carrier,
  source = false,
): void {
  if (typeof value !== 'string' || value === '') {
    return;
  }
  sink.refs.push({
    owner: site.owner,
    detail: site.detail,
    path,
    keys,
    form: 'whole',
    frame: site.frame,
    spelled: value,
    carrier,
    source,
    shadow: NO_SHADOW,
  });
}

/** Record every `{key}` of an interpolated string leaf. */
export function recordInline(
  sink: Sink,
  site: Site,
  path: string,
  keys: readonly string[],
  value: unknown,
  carrier: Carrier,
): void {
  if (typeof value !== 'string') {
    return;
  }
  for (const spelled of inlineKeys(sink, value, site.shadow)) {
    sink.refs.push({
      owner: site.owner,
      detail: site.detail,
      path,
      keys,
      form: 'inline',
      frame: site.frame,
      spelled,
      carrier,
      source: false,
      text: value,
      shadow: site.shadow,
    });
  }
}

/** Record every `{key}` across a string-list leaf (the document's keywords /
 * authors). A non-string element makes the list unrewritable as a whole, so the
 * walk reports itself truncated rather than recording a list it cannot restate. */
export function recordStrings(
  sink: Sink,
  site: Site,
  path: string,
  keys: readonly string[],
  value: unknown,
): void {
  if (!Array.isArray(value)) {
    return;
  }
  if (!value.every((entry): entry is string => typeof entry === 'string')) {
    sink.truncated = true;
    return;
  }
  const spelled = new Set<string>();
  for (const entry of value) {
    for (const key of inlineKeys(sink, entry, site.shadow)) {
      spelled.add(key);
    }
  }
  for (const key of spelled) {
    sink.refs.push({
      owner: site.owner,
      detail: site.detail,
      path,
      keys,
      form: 'strings',
      frame: site.frame,
      spelled: key,
      carrier: 'document',
      source: false,
      strings: value,
      shadow: site.shadow,
    });
  }
}
