// Pure model for the iterable-insert dialog: menu availability, the
// blank-start form's validation, and the dialog's confirm payload. All form
// input is untrusted user text — names are length-capped, the field count is
// bounded, and the existing-key pre-check is own-property-guarded (a
// `__proto__` source name must not walk the prototype). Framework-free; the
// dialog component stays thin over it.

import type { PaletteGroup } from '../palette/model';
import { MAX_SCAFFOLD_FIELDS, type ScaffoldVariant } from './scaffold';
import type { ScaffoldField } from './scaffoldFields';

/** Form caps: the field count rides the scaffold bound; names clip at the
 * palette's display cap so a hostile paste cannot weigh down the document. */
export const MAX_FORM_FIELDS = MAX_SCAFFOLD_FIELDS;
export const MAX_NAME_CHARS = 120;

/** What the dialog hands back on confirm. */
export type IterableChoice =
  | { readonly kind: 'group'; readonly group: PaletteGroup; readonly variant: ScaffoldVariant }
  | {
      readonly kind: 'create';
      readonly name: string;
      readonly fields: readonly ScaffoldField[];
      readonly variant: ScaffoldVariant;
    };

/** Typed refusals the dialog localizes (`iterable.error.*` catalog keys). */
export type IterableRefusal =
  | 'empty_name'
  | 'name_too_long'
  | 'key_exists'
  | 'no_fields'
  | 'empty_field'
  | 'field_too_long'
  | 'duplicate_field'
  | 'too_many_fields'
  | 'invalid_params'
  | 'no_source'
  | 'insert_failed';

/** The menu entry is armed when there is anything to insert: an array group
 * to bind, or the blank-start create flow (workshop mode only — with an engineer
 * schema, params keys are the engineer's; a fresh key would be schema noise). */
export function iterableAvailable(
  groups: readonly PaletteGroup[] | null,
  workshop: boolean,
): boolean {
  return workshop || arrayGroups(groups).length > 0;
}

/** The bindable array groups of a definitions view — the ones a new
 * iterable can bind at document scope. A `rowScope` group is carried by
 * another array's ROWS: its key resolves only from inside that parent's
 * cell, so offering it here would author a source path no params can
 * walk. */
export function arrayGroups(groups: readonly PaletteGroup[] | null): readonly PaletteGroup[] {
  return (groups ?? []).filter((group) => group.isArray && group.rowScope === undefined);
}

/** Validate the blank-start form. `null` = good to go. Params-dependent
 * refusals (`key_exists` / `invalid_params`) are NOT pre-checked here —
 * `extendParams` is the ONE authority on the fresh-key rule, and its typed
 * refusal flows back into the dialog through the confirm handler. The fields
 * list is ignored for a list (a blank-start list enumerates scalars — the
 * form hides its fields section). */
export function validateCreateForm(
  name: string,
  fields: readonly ScaffoldField[],
  variant: ScaffoldVariant,
): IterableRefusal | null {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'empty_name';
  }
  if (trimmed.length > MAX_NAME_CHARS) {
    return 'name_too_long';
  }
  if (variant === 'list') {
    return null;
  }
  if (fields.length === 0) {
    return 'no_fields';
  }
  if (fields.length > MAX_FORM_FIELDS) {
    return 'too_many_fields';
  }
  const seen = new Set<string>();
  for (const field of fields) {
    const fieldName = field.name.trim();
    if (fieldName === '') {
      return 'empty_field';
    }
    if (fieldName.length > MAX_NAME_CHARS) {
      return 'field_too_long';
    }
    if (seen.has(fieldName)) {
      return 'duplicate_field';
    }
    seen.add(fieldName);
  }
  return null;
}

/** The form's normalized fields (trimmed names) — apply AFTER validation. */
export function normalizeFields(fields: readonly ScaffoldField[]): readonly ScaffoldField[] {
  return fields.map((field) => ({ name: field.name.trim(), kind: field.kind }));
}

/** The dialog's confirm outcome — every branch lives here so the component
 * stays a thin dispatcher and hostile/stranded states are unit-testable
 * directly (a group mode with no resolvable group is a typed refusal, never
 * a crash or a silent no-op). */
export type ConfirmOutcome =
  | { readonly ok: true; readonly choice: IterableChoice }
  | { readonly ok: false; readonly refusal: IterableRefusal };

export function confirmChoice(
  mode: 'group' | 'create',
  group: PaletteGroup | undefined,
  name: string,
  fields: readonly ScaffoldField[],
  variant: ScaffoldVariant,
): ConfirmOutcome {
  if (mode === 'group') {
    if (group === undefined) {
      return { ok: false, refusal: 'no_source' };
    }
    return { ok: true, choice: { kind: 'group', group, variant } };
  }
  const refusal = validateCreateForm(name, fields, variant);
  if (refusal !== null) {
    return { ok: false, refusal };
  }
  return {
    ok: true,
    choice: {
      kind: 'create',
      name: name.trim(),
      fields: variant === 'list' ? [] : normalizeFields(fields),
      variant,
    },
  };
}
