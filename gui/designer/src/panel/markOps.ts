// The WRITE side of a form mark's presence (`data:` / `checked:`).
//
// Three rules the wire enforces and this file honours:
//
//   1. `checked` and `data:` are MUTUALLY EXCLUSIVE (the engine warns and
//      `data:` wins), so a switch INTO or OUT OF the bound form drops the other
//      key in the SAME batch — one transactional undo step, never a document
//      that carries both for an instant. (An off↔on tick is not such a switch:
//      there is no other key to drop, and `setCheckedOps` returns `[]` rather
//      than a removal that would refuse the batch.)
//   2. Removing an ABSENT key refuses the whole batch (the `lineArmOps`
//      lesson), so each builder is told what the document actually carries
//      rather than guessing.
//   3. Unset never serializes: an unticked checkbox is the key's ABSENCE, not
//      `checked: false`. The engine draws no check either way, and the blank
//      state is what a fresh form is.
//
// A repoint reconciles a stale `equals` in the same batch, exactly as
// `visibilityOps` does: a boolean field's control is yes/no, which cannot show
// the old field's `equals`, so a kept one would be hidden AND still override
// the boolean read.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { equalsLiteral } from './equalsLiteral';
import { equalsGoesStale } from './rowConditionsModel';

/** Switches the mark to its BOUND form: a `data:` with no field picked yet.
 * The empty key is HONEST — the engine reports it until a field is chosen —
 * and matches how the row-conditions editor seeds a blank rule. Drops
 * `checked` when the document carries it (rule 1). */
export function bindMarkOps(path: string, hasChecked: boolean): readonly Op[] {
  const blank: SnippetValue = { key: '' };
  const ops: Op[] = [{ op: 'putValue', path, keys: ['data'], value: blank }];
  if (hasChecked) {
    ops.push({ op: 'removeKey', path, keys: ['checked'] });
  }
  return ops;
}

/** Switches the mark back to its STATIC form by dropping `data:`. For a
 * checkbox, `checked` decides what the static form then IS — `true` ticks it,
 * anything else leaves the blank box, which is the key's absence. */
export function unbindMarkOps(path: string, checked: boolean, hasChecked: boolean): readonly Op[] {
  const ops: Op[] = [{ op: 'removeKey', path, keys: ['data'] }];
  return [...ops, ...checkedOps(path, checked, hasChecked)];
}

/** Sets a checkbox's static tick. Turning it OFF removes the key (rule 3);
 * turning it on over an absent key writes it. Returns `[]` when the document
 * already says exactly this, so re-picking the state authors nothing and
 * mints no undo step. */
export function setCheckedOps(path: string, checked: boolean, hasChecked: boolean): readonly Op[] {
  return checkedOps(path, checked, hasChecked);
}

function checkedOps(path: string, checked: boolean, hasChecked: boolean): readonly Op[] {
  if (checked) {
    return [{ op: 'setScalar', path, keys: ['checked'], value: true }];
  }
  return hasChecked ? [{ op: 'removeKey', path, keys: ['checked'] }] : [];
}

/** Repoints the binding at another field, reconciling a stale `equals` AND the
 * data scope into the SAME batch so it lands as one undo step.
 *
 * `documentScoped` is the scope the picked field was OFFERED at, not a
 * separate control: inside a `repeat` cell the key resolves against the bound
 * element by default, so picking a TOP-LEVEL field without writing
 * `scope: document` authors a binding that silently resolves to nothing.
 * `undefined` means the caller offers no scope choice and the authored
 * `scope:` is left exactly as the file has it. */
export function repointMarkOps(
  path: string,
  key: string,
  newFieldType: string,
  newFieldEnums: readonly string[],
  hasEquals: boolean,
  equals: string,
  documentScoped?: boolean,
  hasScope = false,
  boolEquals = false,
): readonly Op[] {
  const ops: Op[] = [{ op: 'setScalar', path, keys: ['data', 'key'], value: key }];
  if (documentScoped === true) {
    ops.push({ op: 'setScalar', path, keys: ['data', 'scope'], value: 'document' });
  } else if (documentScoped === false && hasScope) {
    // Element is the default, and unset never serializes — so the key is
    // dropped only when it is THERE. Rule 2 above: `removeKey` on an absent key
    // refuses the whole batch, which would take the `data.key` write with it
    // and leave the pick silently inert. Every mark this panel binds starts
    // from `bindMarkOps`' `{ key: '' }`, i.e. with no scope, so the unguarded
    // form was wrong for the common case rather than for an edge one.
    ops.push({ op: 'removeKey', path, keys: ['data', 'scope'] });
  }
  if (equalsGoesStale(hasEquals, equals, newFieldType, newFieldEnums, boolEquals)) {
    ops.push({ op: 'removeKey', path, keys: ['data', 'equals'] });
  }
  return ops;
}

/** Sets (or, with `null`/`''`, removes) the binding's `equals` — removing it
 * is what makes the binding the boolean form. */
export function setMarkEqualsOp(path: string, value: string | null, fieldType = ''): Op {
  if (value === null || value === '') {
    return { op: 'removeKey', path, keys: ['data', 'equals'] };
  }
  return {
    op: 'setScalar',
    path,
    keys: ['data', 'equals'],
    value: equalsLiteral(value, fieldType),
  };
}
