// What a rename / delete does to the REFERENCES — the half of the `formats:`
// registry model that rewrites every place naming the entry alongside the
// registry key itself. Split from the entry-authoring half (`fieldOps`) because
// only these two read the usage index, and only they can be refused by it.
//
// The rewrite lands in ONE transactional batch (a single undo step) so the
// registry and its references never drift, and it is refused WHOLE — never
// partially applied — when it cannot be done safely: the usage walk truncated
// (references may be missing → a half-rename), a reference path is
// non-addressable (a hostile map key would mis-address a different node), or
// the batch would exceed `MAX_BATCH_OPS`.
//
// A reference is a SCALAR here, not a name list — a binding names exactly one
// format — so a rename is a `setScalar` and a delete a `removeKey`, where the
// styles registry restates a whole array. Deleting leaves the referring binding
// with NO format, which renders the field's own default: the entry is gone, so
// there is nothing truthful to leave behind.
//
// A CHIP reference (`{key:closing}` inside interpolated text) is the one shape
// that does not fit that: the name sits inside a longer string, so both
// operations restate the whole string with just that expression rewritten —
// `{key:newName}` for a rename, a bare `{key}` for a delete, which strips the
// pick exactly as removing a `format:` key does.

import { MAX_BATCH_OPS, type Op } from '@shojiku/designer-core';

import { rewriteChipFormat } from './chipRefs';
import { AMBIGUOUS_FORMAT_NAMES, RESERVED_FORMAT_NAMES } from './model';
import { type FormatOpPlan, refuse } from './plan';
import type { FormatRef, FormatUsage } from './usage';

/** The session's template-size budget: what the document currently weighs and
 * the cap it must stay under. A rename is the one registry operation that can
 * GROW the document — by the name-length delta at the registry key and at every
 * reference — so it is measured before it is applied, the same way an image
 * import is. Nothing downstream re-checks: `Editor.applyAll` bounds the op
 * COUNT, not the resulting bytes. */
export interface SizeBudget {
  /** The document's current size in bytes (`text` is UTF-8). */
  readonly textBytes: number;
  readonly maxBytes: number;
}

/** UTF-8 byte length — a name is arbitrary text, so `.length` (UTF-16 units)
 * would under-count every non-ASCII one. */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** What one reference reads after a rename: the bare new name, or — for a chip
 * reference — the whole interpolated string with just that expression
 * rewritten. */
function renameValue(ref: FormatRef, oldName: string, newName: string): string {
  return ref.text === undefined ? newName : rewriteChipFormat(ref.text, oldName, newName);
}

/** The op applying one reference's new value (absent `path` = the document root
 * — the `defaults.formats.<type>` references). */
function scalarOp(ref: FormatRef, value: string): Op {
  return ref.path === undefined
    ? { op: 'setScalar', keys: ref.keys, value }
    : { op: 'setScalar', path: ref.path, keys: ref.keys, value };
}

/** The op clearing one reference (a delete strips the name rather than leaving
 * a dangling one) — a key removal, or a chip reference's rewritten text. */
function clearRef(ref: FormatRef, oldName: string): Op {
  if (ref.text !== undefined) {
    return scalarOp(ref, rewriteChipFormat(ref.text, oldName, null));
  }
  return ref.path === undefined
    ? { op: 'removeKey', keys: ref.keys }
    : { op: 'removeKey', path: ref.path, keys: ref.keys };
}

/** How many bytes the rename adds across the registry key and every reference.
 * A chip reference is measured by rewriting it, since the name appears inside a
 * longer string and may appear MORE THAN ONCE in it. A document pushed past the
 * cap would fail to re-parse on the next undo, so the rename is refused rather
 * than applied and regretted — nothing downstream re-checks the bytes
 * (`Editor.applyAll` bounds the op COUNT). */
function renameDelta(refs: readonly FormatRef[], oldName: string, newName: string): number {
  const nameDelta = utf8Bytes(newName) - utf8Bytes(oldName);
  let total = nameDelta;
  for (const ref of refs) {
    total +=
      ref.text === undefined
        ? nameDelta
        : utf8Bytes(renameValue(ref, oldName, newName)) - utf8Bytes(ref.text);
  }
  return total;
}

/** The refs a rewrite must touch, or the refusal that stops it before any op is
 * built — the guards rename and delete share. */
type Guarded =
  | { readonly ok: true; readonly refs: readonly FormatRef[] }
  | { readonly ok: false; readonly plan: FormatOpPlan };

function guardRefs(usage: FormatUsage, name: string): Guarded {
  if (usage.truncated) {
    return { ok: false, plan: refuse('truncated_usage') };
  }
  const refs = usage.refs.get(name) ?? [];
  if (1 + refs.length > MAX_BATCH_OPS) {
    return { ok: false, plan: refuse('batch_too_large') };
  }
  if (refs.some((ref) => !ref.addressable)) {
    return { ok: false, plan: refuse('unaddressable_ref') };
  }
  return { ok: true, refs };
}

/** Plan a rename: the registry key AND every reference, in one batch. Refused
 * whole on an empty / duplicate / reserved / ambiguous target, a truncated
 * usage walk, a non-addressable reference, an over-cap batch, or a result that
 * would not fit
 * the session's template-size cap. `existingNames` includes the source name, so
 * renaming to the same name refuses as a duplicate (a no-op). */
export function renameFormatOps(
  oldName: string,
  newName: string,
  existingNames: readonly string[],
  usage: FormatUsage,
  budget: SizeBudget,
): FormatOpPlan {
  if (newName.length === 0) {
    return refuse('empty_name');
  }
  if (existingNames.includes(newName)) {
    return refuse('duplicate_name');
  }
  if (RESERVED_FORMAT_NAMES.includes(newName)) {
    return refuse('reserved_name');
  }
  if (AMBIGUOUS_FORMAT_NAMES.includes(newName)) {
    return refuse('ambiguous_name');
  }
  const guarded = guardRefs(usage, oldName);
  if (!guarded.ok) {
    return guarded.plan;
  }
  if (budget.textBytes + renameDelta(guarded.refs, oldName, newName) > budget.maxBytes) {
    return refuse('document_too_large');
  }
  const ops: Op[] = [{ op: 'renameKey', keys: ['formats', oldName], to: newName }];
  for (const ref of guarded.refs) {
    ops.push(scalarOp(ref, renameValue(ref, oldName, newName)));
  }
  return { ok: true, ops };
}

/** Plan a delete: remove the registry entry AND clear every reference to it, in
 * one batch. Same whole-or-nothing refusals as rename. */
export function deleteFormatOps(name: string, usage: FormatUsage): FormatOpPlan {
  const guarded = guardRefs(usage, name);
  if (!guarded.ok) {
    return guarded.plan;
  }
  const ops: Op[] = [{ op: 'removeKey', keys: ['formats', name] }];
  for (const ref of guarded.refs) {
    ops.push(clearRef(ref, name));
  }
  return { ok: true, ops };
}
