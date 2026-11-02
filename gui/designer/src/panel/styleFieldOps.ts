// What a create / update writes to the style FIELDS — the half of the `styles:`
// registry model that authors values inside one entry. Split from the
// reference-rewriting half (`styleRefOps`) because nothing here reads the usage
// index: an entry's own fields have no references to keep in step, so these
// plans can only be refused by the NAME guards, never by a usage walk.
//
// Every field goes through the same per-kind builders a per-field panel edit
// uses, so a bare number stays a number (never a quoted string) and the GUI's
// authored form matches what an AI would emit. Registry names are attacker
// strings; each op addresses them by a literal `keys` path.
//
// The keys the form's 「その他の設定」 lists are edited as wire values, not
// display strings (`WireEdits`): each one the author left at a new value
// becomes the op a live host would dispatch for the same edit.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { lengthOp, numberOp, plainTextOp } from './model';
import { type FieldValues, fieldEditOp, sameValue, valueAt } from './schema/fieldEdit';
import { STYLE_FIELDS, type StyleFieldSpec } from './styleFieldSpecs';
import { refuse, type StyleOpPlan } from './stylePlan';
import { MAX_STYLES } from './stylesModel';

/** The listed keys the form edited: the wire value each was left at
 * (`undefined` = removed), keyed by style key. A key never touched is absent. */
export type WireEdits = Readonly<Record<string, SnippetValue | undefined>>;

/** One op per edited key whose value differs from `saved` (the entry as it
 * was read; empty for a create). */
function wireOps(name: string, edits: WireEdits, saved: FieldValues): Op[] {
  return Object.entries(edits).flatMap(([key, value]) =>
    sameValue(valueAt(saved, key), value)
      ? []
      : [fieldEditOp(undefined, ['styles', name], { keys: [key], value })],
  );
}

/** The op for one style field edit at `styles.<name>.<prop>`, dispatched by the
 * field kind (the panel's per-kind policy, reused): `number` may return `null`
 * for a non-finite value; the others always produce an op (empty clears). */
export function styleFieldOp(name: string, spec: StyleFieldSpec, raw: string): Op | null {
  const keys = ['styles', name, spec.key];
  if (spec.kind === 'number') {
    return numberOp(undefined, keys, raw);
  }
  if (spec.kind === 'length') {
    return lengthOp(undefined, keys, raw);
  }
  return plainTextOp(undefined, keys, raw);
}

/** Plan a create carrying the field values (the unified create form): validate
 * the name (empty / duplicate / over-cap), then author the entry as an empty
 * map plus ONE canonical per-field op for every NON-EMPTY field — the same
 * builders a per-field edit uses, so a bare number stays a number (never a
 * quoted string). Empty fields are unset keys, never written. The whole batch
 * is one undo step. An invalid numeric field (a non-finite `lineHeight`) yields
 * no op and is simply omitted, matching `styleFieldOp`. */
export function createStyleWithFieldsOps(
  name: string,
  fields: Readonly<Record<string, string>>,
  existingNames: readonly string[],
  edits: WireEdits = {},
): StyleOpPlan {
  if (name.length === 0) {
    return refuse('empty_name');
  }
  if (existingNames.includes(name)) {
    return refuse('duplicate_name');
  }
  if (existingNames.length >= MAX_STYLES) {
    return refuse('too_many_styles');
  }
  const ops: Op[] = [{ op: 'putValue', keys: ['styles', name], value: {} }];
  for (const spec of STYLE_FIELDS) {
    const raw = fields[spec.key] ?? '';
    if (raw.length === 0) {
      continue;
    }
    const op = styleFieldOp(name, spec, raw);
    if (op !== null) {
      ops.push(op);
    }
  }
  ops.push(...wireOps(name, edits, {}));
  return { ok: true, ops };
}

/** Plan an update from the form: emit a canonical op ONLY for a field whose
 * value CHANGED against the current registry entry ("only touched keys
 * change"). The listed keys' `edits` write the same way against `saved`, the
 * entry's own map as the form read it. A prop the form did not change (a
 * per-side border map, which the form only shows) is never referenced, so it
 * survives byte-intact — never a whole-map replace. A field cleared to empty
 * emits its `removeKey`; an unchanged field emits nothing. The plan always
 * succeeds (a no-change form yields an empty, inert batch). */
export function updateStyleFieldsOps(
  name: string,
  fields: Readonly<Record<string, string>>,
  current: Readonly<Record<string, string>>,
  edits: WireEdits = {},
  saved: FieldValues = {},
): StyleOpPlan {
  const ops: Op[] = [];
  for (const spec of STYLE_FIELDS) {
    const next = fields[spec.key] ?? '';
    const prev = current[spec.key] ?? '';
    if (next === prev) {
      continue;
    }
    const op = styleFieldOp(name, spec, next);
    if (op !== null) {
      ops.push(op);
    }
  }
  ops.push(...wireOps(name, edits, saved));
  return { ok: true, ops };
}
