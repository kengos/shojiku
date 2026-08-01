// The definitions-edit PLAN side: adding a fresh data field, and the restore
// guard over a persisted edit list. Both sit at the untrusted boundary — one
// takes a name the user typed, the other a value read back from user-writable
// storage — so they are pure, own-property-guarded and total (a refusal, never
// a throw). The metadata reads and op builders live beside them in
// `definitionsEdit.ts`; the apply path is that file's `applyDefinitionOps`.

import type { Op, SnippetValue } from '@shojiku/designer-core';
import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { MAX_FIELD_NAME_CHARS } from '../insert/fieldModel';
import type { DefinitionType } from './definitionsEdit';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Cap on a restored edit list — user-writable storage must not smuggle an
 * unbounded op array into every render's re-apply. Mirrors designer-core's
 * batch bound. */
export const MAX_DEFS_EDITS = 256;

/** Narrow a persisted (user-writable, hostile) value to a definition-edit op
 * list: an array of records carrying a string `op`, count-capped. Deep
 * validation stays with designer-core's `applyOp` — a structurally plausible
 * but invalid op is refused there and skipped by `applyDefinitionOps`.
 * Anything else degrades to no edits. */
export function sanitizeDefsEdits(raw: unknown): readonly Op[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .slice(0, MAX_DEFS_EDITS)
    .filter(
      (entry): entry is Op =>
        typeof entry === 'object' &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).op === 'string',
    );
}

/** Typed refusals the add-field form surfaces (`data.error.*` chrome keys). */
export type AddFieldRefusal = 'empty_name' | 'name_too_long' | 'key_exists';

export type AddFieldPlan =
  | { readonly ok: true; readonly op: Op }
  | { readonly ok: false; readonly reason: AddFieldRefusal };

/** Plan a fresh top-level data field: a `putValue` op at `properties.<name>`
 * with the picked scalar type, own-property-guarded against an existing key.
 * Returns the OP (not applied text) so the Designer coalesces it into its edit
 * list like every other definition edit; the name is authored through
 * `createNode` (no structural injection). Lets a missing field be added without
 * leaving the Designer (the plan's editable-definitions goal), and works even
 * when the sample data is read-only (a mounted host). */
export function addFieldPlan(defsText: string, name: string, type: DefinitionType): AddFieldPlan {
  const trimmed = name.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'empty_name' };
  }
  if (trimmed.length > MAX_FIELD_NAME_CHARS) {
    return { ok: false, reason: 'name_too_long' };
  }
  let root: unknown;
  try {
    root = readTemplate(parseTemplate(defsText));
  } catch {
    root = undefined;
  }
  const properties = record(record(root)?.properties);
  if (properties !== undefined && Object.hasOwn(properties, trimmed)) {
    return { ok: false, reason: 'key_exists' };
  }
  const value: SnippetValue = { type };
  return { ok: true, op: { op: 'putValue', keys: ['properties', trimmed], value } };
}
