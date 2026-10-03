// The template half of a rename: one op per LEAF holding a reference to the
// renamed node (or anything under it), rewriting only the spelled keys that
// name it. A key-valued leaf is restated whole; an interpolated string is
// re-emitted segment by segment from its own wire slices, so every byte the
// rename does not touch survives — escapes, other expressions, a `:format`.

import { MAX_BATCH_OPS, type Op } from '@shojiku/designer-core';
import { parseRawSegments } from '../../text/interpolate';
import { namesUnder } from './match';
import type { DataRef } from './types';

/** A rename in reference terms: the node's frame and its relative key before
 * and after (dotted; only the LAST segment differs). */
export interface RefRename {
  readonly frame: readonly string[];
  readonly from: string;
  readonly to: string;
}

export type RewriteRefusal = 'not_interpolatable' | 'binding_capture' | 'too_many_refs';

export type RewritePlan =
  | { readonly ok: true; readonly ops: readonly Op[] }
  | { readonly ok: false; readonly reason: RewriteRefusal };

/** The interpolation grammar's key characters minus `.` (a data name cannot
 * hold one): what a `{key}` can spell. */
const INTERPOLABLE = /^[A-Za-z0-9_]+$/;

/** The renamed spelling of `spelled` in `frame`, or `null` when it does not
 * name the renamed node. */
export function renamedKey(
  rename: RefRename,
  frame: readonly string[],
  spelled: string,
): string | null {
  return namesUnder(frame, spelled, rename.frame, rename.from) ? rekey(rename, spelled) : null;
}

/** The new spelling of a key already known to name the renamed node. */
function rekey(rename: RefRename, spelled: string): string {
  return rename.to + spelled.slice(rename.from.length);
}

function rewriteText(text: string, ref: DataRef, rename: RefRename): string {
  let out = '';
  for (const segment of parseRawSegments(text)) {
    const next =
      segment.kind === 'expr' && !ref.shadow.has(segment.key)
        ? renamedKey(rename, ref.frame, segment.key)
        : null;
    if (next === null || segment.kind !== 'expr') {
      out += segment.raw;
    } else {
      out += segment.format === null ? `{${next}}` : `{${next}:${segment.format}}`;
    }
  }
  return out;
}

function leafOp(ref: DataRef, rename: RefRename): Op {
  const at = { path: ref.path, keys: ref.keys };
  if (ref.form === 'strings') {
    const values = ref.strings.map((entry) => rewriteText(entry, ref, rename));
    return { op: 'setStrings', ...at, values };
  }
  const value =
    ref.form === 'inline' ? rewriteText(ref.text, ref, rename) : rekey(rename, ref.spelled);
  return { op: 'setScalar', ...at, value };
}

/** Plan the template rewrite for `refs` (already filtered to the renamed node).
 * Refused whole when a rewritten `{key}` could not be read back as one (a name
 * outside the interpolation characters), when it would be captured by a
 * `bindings:` name declared on the same item, or when the batch is over
 * `MAX_BATCH_OPS`. */
export function rewritePlan(
  refs: readonly DataRef[],
  rename: RefRename,
  name: string,
): RewritePlan {
  const inline = refs.filter((ref) => ref.form !== 'whole');
  if (inline.length > 0 && !INTERPOLABLE.test(name)) {
    return { ok: false, reason: 'not_interpolatable' };
  }
  if (inline.some((ref) => ref.shadow.has(rekey(rename, ref.spelled)))) {
    return { ok: false, reason: 'binding_capture' };
  }
  const leaves = new Map<string, DataRef>();
  for (const ref of refs) {
    leaves.set(JSON.stringify([ref.path, ref.keys]), ref);
  }
  if (leaves.size > MAX_BATCH_OPS) {
    return { ok: false, reason: 'too_many_refs' };
  }
  return { ok: true, ops: [...leaves.values()].map((ref) => leafOp(ref, rename)) };
}
