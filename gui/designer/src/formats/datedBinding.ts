// WHICH format references a rename may rewrite — the structural rule the usage
// walk filters by.
//
// A `formats:` registry entry is `date`/`datetime`-KIND only (`FORMAT_KINDS`,
// mirroring the engine's `NamedFormatKind`), and the engine consults the
// registry in exactly one place: the dated arms of format dispatch
// (`engine/formatter/src/format.rs` `render_dated`, `ctx.named` →
// `named.or(from_pack)`). So the registry is reachable from a DATED binding and
// from nothing else, and a `format:` written on any other slot is never a
// registry reference WHATEVER it spells — `format: symbol` on a currency
// binding names the currency's symbol variant, not an entry that happens to be
// called `symbol`.
//
// Filtering by that rule rather than by a table of builtin spellings is
// deliberate: a spelling table would have to track `money.rs`, `text.rs`,
// `format.rs` and every locale pack, and would drift the first time one of them
// gains a variant.
//
// The fallback is asymmetric ON PURPOSE. When the type cannot be resolved — no
// definitions loaded, a key the schema does not declare — the reference is
// RECORDED. Over-rewriting an unresolvable site is today's behaviour and is
// visible; under-rewriting a real dated reference leaves a dangling name the
// engine warns about, which is the worse failure.

import type { PaletteGroup } from '../palette/model';
import { FORMAT_KINDS } from './model';

/** The declared type of the field `key` names in `scope`, or `undefined` when
 * the definitions cannot answer (none loaded, or no such field). Scope
 * selection mirrors the picker's: document scope reads the non-array groups'
 * full keys, an array scope reads that group's row-relative ones. Plain string
 * comparison over arrays — a field named `__proto__` is just a string here. */
export function fieldTypeFor(
  groups: readonly PaletteGroup[] | null,
  scope: string | null,
  key: string,
): string | undefined {
  if (groups === null) {
    return undefined;
  }
  for (const group of groups) {
    if (scope === null ? group.isArray : group.id !== scope || !group.isArray) {
      continue;
    }
    for (const field of group.fields) {
      if (field.key === key) {
        return field.type;
      }
    }
  }
  return undefined;
}

/** Whether a `{key:format}` chip CAN be a registry reference.
 *
 * A chip is harder than a `data:` binding, because the walk cannot always know
 * WHICH (key, scope) pair the engine will resolve it against. Two positions
 * diverge from the walk's structural reading: a `list`'s per-entry `text:`
 * resolves against the array ENTRY rather than the ambient scope, and a table
 * column's `label:` resolves at DOCUMENT scope with an EMPTY declaration map
 * (`layout/engine/table.rs` `header_label`). Resolving one pair confidently is
 * therefore not enough — where a field NAME exists at more than one scope with
 * different types, the walk can answer for the wrong one and DROP a live
 * reference, which is the failure this whole rule exists to avoid.
 *
 * So the caller hands over every pair the chip could plausibly resolve to, and
 * the answer is yes unless EVERY pair that resolves at all says non-dated. An
 * unresolvable pair is ignored rather than decisive — otherwise one absent
 * candidate would record everything and the filter would do nothing — but a
 * chip where NOTHING resolves keeps the record-rather-than-miss fallback. */
export function datedChip(
  groups: readonly PaletteGroup[] | null,
  scopes: readonly (string | null)[],
  keys: readonly string[],
): boolean {
  let resolvedAny = false;
  for (const scope of scopes) {
    for (const key of keys) {
      const type = fieldTypeFor(groups, scope, key);
      if (type === undefined) {
        continue;
      }
      if (FORMAT_KINDS.includes(type)) {
        return true;
      }
      resolvedAny = true;
    }
  }
  return !resolvedAny;
}

/** Whether a `format:` naming this binding CAN be a registry reference — true
 * for a dated field and for every field whose type is unresolvable (the
 * record-rather-than-miss fallback above). `key` is `undefined` for a malformed
 * binding that carries a format but no key, which is likewise unresolvable.
 *
 * A binding needs no candidate SET the way a chip does: the walk's scope
 * tracking mirrors the template walk's own (`palette/bindings.ts` `walkItems`)
 * arm for arm, so a `data:` binding's scope is the engine's. */
export function datedBinding(
  groups: readonly PaletteGroup[] | null,
  scope: string | null,
  key: string | undefined,
): boolean {
  if (key === undefined) {
    return true;
  }
  const type = fieldTypeFor(groups, scope, key);
  return type === undefined || FORMAT_KINDS.includes(type);
}
