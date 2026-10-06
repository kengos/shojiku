// Naming a node: what writing a new `id:` at a path means for the whole
// document. One answer per entry — the ops (the id itself plus every anchor
// that follows it, one transactional batch so one undo restores both), or the
// reason it is refused. Pure; the field (`panel/ItemIdField.tsx`) renders it.
//
// The engine has no id grammar (any string parses), so the rule here is the
// Designer's: trimmed, non-empty, no control characters, at most the data-item
// name cap — and UNIQUE across the namespace, which is the user's decision: two
// different nodes sharing an id make every anchor to it resolve to whichever is
// placed first on the page (`anchor_ambiguous_target`).

import { MAX_BATCH_OPS, type Op } from '@shojiku/designer-core';
import { MAX_NAME_CHARS } from '../insert/iterableModel';
import { holdersOf, type IdIndex, refsTo } from './idIndex';
import type { IdHolder } from './walk';

/** Longest id the field accepts — the data-item name cap, the sibling
 * identifier the Designer already guards. */
export const MAX_ID_CHARS = MAX_NAME_CHARS;

// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters in an entered name is the intent.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Whether `text` is a name this rule accepts at all — non-empty, no control
 * characters, within `MAX_ID_CHARS` code points. Uniqueness is a separate,
 * namespace-wide question (`idEdit`); this is the per-string half, shared by
 * every control that writes a name into a reference. */
export function isIdText(text: string): boolean {
  return text !== '' && [...text].length <= MAX_ID_CHARS && !CONTROL_RE.test(text);
}

/** A refusal with nothing to name beyond its reason. */
export type IdRefusal = 'too_long' | 'control' | 'truncated' | 'too_many';

export type IdEdit =
  | { readonly ok: true; readonly ops: readonly Op[]; readonly clears: boolean }
  | { readonly ok: false; readonly reason: IdRefusal }
  /** Another node already carries the name — `holder` is that node. */
  | { readonly ok: false; readonly reason: 'duplicate'; readonly holder: IdHolder };

/** How many circles and lines follow `current` — the id the node being
 * edited carries — if it is renamed: the distinct ITEMS naming it (a line with
 * both ends on it is one line). Zero when another node also carries the id
 * (the anchors then stay with that node). */
export function followers(index: IdIndex, current: string | undefined): number {
  if (current === undefined || holdersOf(index, current).length !== 1) {
    return 0;
  }
  return new Set(refsTo(index, current).map((ref) => ref.path)).size;
}

/** The ops for entering `raw` as the id of the node at `path` whose authored
 * id is `current`. An entry equal to `current` (after trimming) authors
 * nothing; an empty one removes the key. */
export function idEdit(
  index: IdIndex,
  path: string,
  current: string | undefined,
  raw: string,
): IdEdit {
  const next = raw.trim();
  if (next === (current ?? '')) {
    return { ok: true, ops: [], clears: false };
  }
  // Before the CLEAR arm too: whether a clear needs its confirm is counted from
  // this same index, and a partial one would count no anchors and skip it.
  if (index.truncated) {
    return { ok: false, reason: 'truncated' };
  }
  if (next === '') {
    return { ok: true, ops: [{ op: 'removeKey', path, keys: ['id'] }], clears: true };
  }
  // Counted in code points, so the message's "characters" holds for an emoji.
  if ([...next].length > MAX_ID_CHARS) {
    return { ok: false, reason: 'too_long' };
  }
  if (CONTROL_RE.test(next)) {
    return { ok: false, reason: 'control' };
  }
  const taken = holdersOf(index, next).find((holder) => holder.path !== path);
  if (taken !== undefined) {
    return { ok: false, reason: 'duplicate', holder: taken };
  }
  const ops: Op[] = [{ op: 'setScalar', path, keys: ['id'], value: next }];
  if (followers(index, current) > 0 && current !== undefined) {
    for (const ref of refsTo(index, current)) {
      ops.push({ op: 'setScalar', path: ref.path, keys: ref.keys, value: next });
    }
  }
  if (ops.length > MAX_BATCH_OPS) {
    return { ok: false, reason: 'too_many' };
  }
  return { ok: true, ops, clears: false };
}

/** `<stem>_<n>`, with the stem cut (in code points) so the whole name stays
 * within `MAX_ID_CHARS` — the Designer must not mint a name its own field
 * would refuse. */
function withSuffix(stem: string, n: number): string {
  const suffix = `_${n}`;
  const points = [...stem];
  const room = MAX_ID_CHARS - suffix.length;
  return points.length > room ? `${points.slice(0, room).join('')}${suffix}` : `${stem}${suffix}`;
}

/** `base` if it is free, else the next free `<stem>_<n>` — a name already
 * ending in `_<n>` counts on from there (`total_2` → `total_3`). Bounded: the
 * loop stops within `taken.size + 1` tries. */
export function freshName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  // At most nine digits: a longer run would count on past `Number`'s exact
  // integers, and a name like that is not one a person numbered.
  const numbered = /^(.*)_(\d{1,9})$/.exec(base);
  const stem = numbered === null ? base : numbered[1];
  let n = numbered === null ? 2 : Number(numbered[2]) + 1;
  while (taken.has(withSuffix(stem, n))) {
    n += 1;
  }
  return withSuffix(stem, n);
}
