// What a create / edit writes to one `formats:` ENTRY — the half of the
// registry model that authors values inside an entry. Split from the
// reference-rewriting half (`refOps`) because nothing here reads the usage
// index: an entry's own fields have no references to keep in step, so these
// plans can only be refused by the NAME and PATTERN guards.
//
// **An empty pattern authors NOTHING.** `NamedFormat.type` and
// `NamedFormat.pattern` are both REQUIRED wire fields (`String`/enum — no
// `Option`, no `serde(default)`), so the panel's usual "an empty value clears
// the key" policy would author a template the ENGINE CANNOT PARSE. That
// failure is invisible to every gate: the op succeeds, the YAML is valid, and
// the break is one layer down. So an empty pattern is a refusal, never a write.

import type { Op } from '@shojiku/designer-core';
import { AMBIGUOUS_FORMAT_NAMES, editableKind, MAX_FORMATS, RESERVED_FORMAT_NAMES } from './model';
import { type FormatOpPlan, refuse } from './plan';

/** Plan a create: author the whole entry — name, kind and pattern — as ONE
 * `putValue`, so the registry never briefly holds a half-written entry the
 * engine would refuse to parse. Refused on an empty / duplicate / reserved /
 * ambiguous name, an over-cap registry, or an empty pattern. */
export function createFormatOps(
  name: string,
  kind: string,
  pattern: string,
  existingNames: readonly string[],
): FormatOpPlan {
  if (name.length === 0) {
    return refuse('empty_name');
  }
  if (existingNames.includes(name)) {
    return refuse('duplicate_name');
  }
  if (RESERVED_FORMAT_NAMES.includes(name)) {
    return refuse('reserved_name');
  }
  if (AMBIGUOUS_FORMAT_NAMES.includes(name)) {
    return refuse('ambiguous_name');
  }
  if (existingNames.length >= MAX_FORMATS) {
    return refuse('too_many_formats');
  }
  if (pattern.length === 0) {
    return refuse('empty_pattern');
  }
  return {
    ok: true,
    ops: [
      {
        op: 'putValue',
        keys: ['formats', name],
        value: { type: editableKind(kind), pattern },
      },
    ],
  };
}

/** Plan an edit of an existing entry's kind and pattern. Each is written as its
 * own `setScalar` — never a whole-map `putValue` — so an untouched key (and the
 * comments around it) stays byte-intact. Only CHANGED fields produce an op, so
 * an edit that changed nothing is an empty batch and lands no undo step. */
export function updateFormatOps(
  name: string,
  kind: string,
  pattern: string,
  current: { readonly kind: string; readonly pattern: string },
): FormatOpPlan {
  if (pattern.length === 0) {
    return refuse('empty_pattern');
  }
  const ops: Op[] = [];
  const nextKind = editableKind(kind);
  if (nextKind !== current.kind) {
    ops.push({ op: 'setScalar', keys: ['formats', name, 'type'], value: nextKind });
  }
  if (pattern !== current.pattern) {
    ops.push({ op: 'setScalar', keys: ['formats', name, 'pattern'], value: pattern });
  }
  return { ok: true, ops };
}
