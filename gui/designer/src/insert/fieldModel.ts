// Pure model for the create-data-field modal: the form's validation,
// the scalar schema a confirmed field extends params with, and the typed
// sample seed per kind. All form input is untrusted user text — the name is
// length-capped and the sample value is clipped, and the params-dependent
// refusals (`key_exists` / `invalid_params`) are NOT decided here: `extendParams`
// is the ONE authority on the fresh-key rule, and its typed refusal flows back
// through the confirm handler. Framework-free; the dialog stays thin over it.

import type { SampleScalar } from '../sample/model';
import { MAX_NAME_CHARS } from './iterableModel';
import type { FieldKind } from './scaffoldFields';

/** The name cap rides the iterable form's (a hostile paste cannot weigh the
 * document down); the sample value is clipped to the same bound. */
export const MAX_FIELD_NAME_CHARS = MAX_NAME_CHARS;
export const MAX_FIELD_SAMPLE_CHARS = 200;

/** What the modal hands back on confirm: a fresh top-level field. */
export interface FieldChoice {
  readonly name: string;
  readonly kind: FieldKind;
  /** The editable sample value, already typed per kind. It rides into the
   * schema as `example`, which `extendParams` consumes first. */
  readonly sample: SampleScalar;
}

/** Typed refusals the dialog localizes (`field.error.*` catalog keys). Only
 * `empty_name` / `name_too_long` come from this model; `key_exists` /
 * `invalid_params` come from `extendParams`, and `insert_failed` from the
 * Designer's insert op (a hostile document body). */
export type FieldRefusal =
  | 'empty_name'
  | 'name_too_long'
  | 'key_exists'
  | 'invalid_params'
  | 'insert_failed';

/** The typed sample seed for a freshly-picked kind: empty text, zero, false, or
 * today's date. `today` is injected (the GUI's authoring-time clock) so the
 * function stays pure and testable — mirrors `sample/model` `initialSampleValue`
 * but keyed by the `FieldKind` quintet the modal offers (`currency` seeds 0,
 * like `number`). */
export function initialFieldSample(kind: FieldKind, today: string): SampleScalar {
  switch (kind) {
    case 'number':
    case 'currency':
      return 0;
    case 'boolean':
      return false;
    case 'date':
      return today;
    case 'text':
      return '';
  }
}

/** Clip a string sample to the cap (a number/boolean sample is already bounded).
 * The clip is on the STORED value so a hostile paste can never bloat params. */
function clipSample(sample: SampleScalar): SampleScalar {
  return typeof sample === 'string' && sample.length > MAX_FIELD_SAMPLE_CHARS
    ? sample.slice(0, MAX_FIELD_SAMPLE_CHARS)
    : sample;
}

/** The `extendParams` schema for one scalar field: the type (+ `date` format)
 * plus the editable sample as `example`, which `extendParams`' `genLeaf` takes
 * ahead of any synth so the preview shows exactly what the user typed. */
export function fieldSchema(kind: FieldKind, sample: SampleScalar): Record<string, unknown> {
  const example = clipSample(sample);
  switch (kind) {
    case 'text':
      return { type: 'string', example };
    case 'number':
      return { type: 'number', example };
    case 'currency':
      // A number refined by the currency display format; the code rides the
      // `defaults.currency` chain, so no per-field `currency:` is authored.
      return { type: 'number', format: 'currency', example };
    case 'date':
      return { type: 'string', format: 'date', example };
    case 'boolean':
      return { type: 'boolean', example };
  }
}

/** Validate the form. `null` = good to go. Only the name is checked here (the
 * key rule lives in `extendParams`); the sample is always valid (its widget
 * produces a typed value). */
export function validateFieldForm(name: string): FieldRefusal | null {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'empty_name';
  }
  if (trimmed.length > MAX_FIELD_NAME_CHARS) {
    return 'name_too_long';
  }
  return null;
}

/** The dialog's confirm outcome — every branch lives here so the component
 * stays a thin dispatcher and the states are unit-testable directly. */
export type FieldConfirmOutcome =
  | { readonly ok: true; readonly choice: FieldChoice }
  | { readonly ok: false; readonly refusal: FieldRefusal };

export function confirmField(
  name: string,
  kind: FieldKind,
  sample: SampleScalar,
): FieldConfirmOutcome {
  const refusal = validateFieldForm(name);
  if (refusal !== null) {
    return { ok: false, refusal };
  }
  return { ok: true, choice: { name: name.trim(), kind, sample: clipSample(sample) } };
}
