// What a rename / delete does to the REFERENCES — the half of the `styles:`
// registry model that rewrites every `styleNames` / `alternateStyleNames`
// mention alongside the registry key itself. Split from the field-authoring
// half (`styleFieldOps`) because only these two ops read the usage index, and
// only they can be refused by it.
//
// The rewrite lands in ONE transactional batch (a single undo step) so the
// registry and its references never drift, and it is refused WHOLE — never
// partially applied — when it cannot be done safely: the usage walk truncated
// (references may be missing → a half-rename), a reference path is
// non-addressable (a hostile map key would mis-address a different node), or the
// batch would exceed `MAX_BATCH_OPS`. Names are attacker strings, but every op
// addresses them by a literal `keys` path (`['styles', name, …]`), safe for any
// string.

import { MAX_BATCH_OPS, type Op } from '@shojiku/designer-core';
import type { StyleUsage } from '../styles/usage';
import { refuse, type StyleOpPlan } from './stylePlan';
import { dedupe } from './stylesModel';

/** Plan a rename: the registry key AND every reference, in one batch. Refused
 * whole on an empty/duplicate target, a truncated usage walk, a non-addressable
 * reference, or an over-cap batch. `existingNames` includes the source name, so
 * renaming to the same name refuses as a duplicate (a no-op). */
export function renameStyleOps(
  oldName: string,
  newName: string,
  existingNames: readonly string[],
  usage: StyleUsage,
): StyleOpPlan {
  if (newName.length === 0) {
    return refuse('empty_name');
  }
  if (existingNames.includes(newName)) {
    return refuse('duplicate_name');
  }
  if (usage.truncated) {
    return refuse('truncated_usage');
  }
  const refs = usage.refs.get(oldName) ?? [];
  if (1 + refs.length > MAX_BATCH_OPS) {
    return refuse('batch_too_large');
  }
  const ops: Op[] = [{ op: 'renameKey', keys: ['styles', oldName], to: newName }];
  for (const ref of refs) {
    if (!ref.addressable) {
      return refuse('unaddressable_ref');
    }
    // The ref lists oldName; map it to newName and dedupe (newName may already
    // sit in the same list). The result always still holds newName, never empty.
    const names = dedupe(ref.names.map((name) => (name === oldName ? newName : name)));
    ops.push({ op: 'setStrings', path: ref.path, keys: [ref.key], values: names });
  }
  return { ok: true, ops };
}

/** Plan a delete: remove the registry entry AND strip the name from every
 * reference, in one batch. A reference emptied of names has its whole key
 * removed (`removeKey`), else it is restated without the name. Same whole-or-
 * nothing refusals as rename. */
export function deleteStyleOps(name: string, usage: StyleUsage): StyleOpPlan {
  if (usage.truncated) {
    return refuse('truncated_usage');
  }
  const refs = usage.refs.get(name) ?? [];
  if (1 + refs.length > MAX_BATCH_OPS) {
    return refuse('batch_too_large');
  }
  const ops: Op[] = [{ op: 'removeKey', keys: ['styles', name] }];
  for (const ref of refs) {
    if (!ref.addressable) {
      return refuse('unaddressable_ref');
    }
    const remaining = dedupe(ref.names.filter((entry) => entry !== name));
    ops.push(
      remaining.length === 0
        ? { op: 'removeKey', path: ref.path, keys: [ref.key] }
        : { op: 'setStrings', path: ref.path, keys: [ref.key], values: remaining },
    );
  }
  return { ok: true, ops };
}
