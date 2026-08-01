// The sample-data SUBSTRATE: the shape vocabulary the params document is read
// and written through — the hostile-input caps, the view types, the widget-kind
// mapping, the own-property readers, the ONE parse/serialize pair, and the
// value coercions the editor's inputs commit through.
//
// Mirrors the palette model's posture — pure TS, no React, hostile-input caps —
// but over the DATA document (params.json), not the schema. `parseParams` runs
// through `JSON.parse`, which defines `__proto__` as an inert own property
// rather than the prototype, and every reader here takes own properties only.
//
// The two sides built on this substrate are `view.ts` (params → the editable
// view, schema labels/types) and `edit.ts` (the named `text -> text` edit
// primitives).

import type { EnumOption } from '../palette/fieldDisplay';
import { splitDateTime } from './datetime';

/** The largest params text we parse — a hostile-input bound, comfortably above
 * any real sample document (the bundled variants are single-digit KiB). */
export const MAX_PARAMS_BYTES = 1_048_576;
/** Nesting cap for every value walk (bounds deep/cyclic-shaped hostile data). */
export const MAX_WALK_DEPTH = 32;
/** Display caps for the panel's DOM. */
export const MAX_TEXT_CHARS = 200;
export const MAX_ROWS_SHOWN = 500;
export const MAX_FIELDS = 512;

/** Which input widget a field drives. `datetime` drives a `datetime-local`
 * input over the value's wall clock (see `sample/datetime`). */
export type SampleKind = 'string' | 'number' | 'boolean' | 'date' | 'datetime';

/** A path into the params document: object keys as strings, array indices as
 * numbers. Kept as segments (never a dotted string) so a key containing a `.`
 * or `[` is unambiguous and a hostile key can never be mis-addressed. */
export type SampleSeg = string | number;
export type SamplePath = readonly SampleSeg[];

/** One editable leaf value. `value` is the FULL string form (the editable
 * input seeds from it); read-only display clips via `clipText`. */
export interface SampleField {
  readonly path: SamplePath;
  readonly label: string;
  readonly kind: SampleKind;
  readonly value: string;
  /** The field's declared `enum` members, when it declares a closed set —
   * the editor offers them as a choice instead of free entry. Empty
   * otherwise (an undeclared field, or no definitions at all). */
  readonly options: readonly EnumOption[];
}

/** One row of an array group (its object leaves, or a single scalar leaf). */
export interface SampleRow {
  readonly path: SamplePath;
  readonly fields: readonly SampleField[];
}

/** A repeating array of sample rows (`items`, …). */
export interface SampleArrayGroup {
  readonly path: SamplePath;
  readonly label: string;
  readonly rows: readonly SampleRow[];
}

/** A top-level object's scalar leaves (id `''` = the leading ungrouped
 * scalars). */
export interface SampleGroup {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly SampleField[];
}

/** The panel's editable view of the params document. */
export interface SampleView {
  readonly groups: readonly SampleGroup[];
  readonly arrays: readonly SampleArrayGroup[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read an own property WITHOUT walking the prototype — so a `__proto__` path
 * segment reads the inert own data property (or nothing), never the accessor. */
export function ownGet(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/** Clip a display string; the editable input keeps the full value. */
export function clipText(value: string): string {
  return value.length > MAX_TEXT_CHARS ? `${value.slice(0, MAX_TEXT_CHARS)}…` : value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A scalar's display string (empty for containers/null). */
export function display(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** Infer a widget kind from a JSON value (used when no schema declares it). */
export function inferKind(value: unknown): SampleKind {
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) {
      return 'date';
    }
    // A datetime-shaped value (has a `T` time part) gets the wall-clock editor.
    if (splitDateTime(value) !== null) {
      return 'datetime';
    }
  }
  return 'string';
}

/** Map a palette display-type name to a widget kind. The palette maps a
 * `format: date-time` field to the `datetime` display type. */
export function kindFromType(type: string): SampleKind {
  if (type === 'date') {
    return 'date';
  }
  if (type === 'datetime') {
    return 'datetime';
  }
  if (type === 'number' || type === 'currency' || type === 'quantity' || type === 'percentage') {
    return 'number';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  return 'string';
}

/** Parse the params text into a JSON object, or `null` (malformed, non-object
 * root, over the size cap). Exported for the schema-driven generators. */
export function parseParams(text: string): Record<string, unknown> | null {
  if (text.length > MAX_PARAMS_BYTES) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

/** Serialize a params value back to JSON text (2-space, matching the bundled
 * params files). Numbers normalize here (`8506.00` -> `8506`). The single
 * serialization home. */
export function serializeParams(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** A scalar value the panel commits (typed per the field's kind). */
export type SampleScalar = string | number | boolean;

/** Coerce a raw input string to the typed value for a field kind: number →
 * parsed (a non-finite entry stays a string so the engine surfaces the
 * mismatch, not a silent 0), boolean → the checkbox flag, string/date → as-is. */
export function coerceSampleValue(kind: SampleKind, raw: string): SampleScalar {
  if (kind === 'number') {
    const n = Number(raw);
    return raw.trim() !== '' && Number.isFinite(n) ? n : raw;
  }
  if (kind === 'boolean') {
    return raw === 'true';
  }
  return raw;
}

/** The kinds the blank-start add-field form offers (a typed picker, so a numeric
 * or boolean sample value is not stuck as a string). `datetime` is deliberately
 * NOT offered here — it needs a real RFC 3339 value, not a blank one. */
export type AddFieldKind = 'string' | 'number' | 'date' | 'boolean';

/** The initial value for a freshly-added sample field of a given kind: an empty
 * string, zero, false, or today's date (`yyyy-mm-dd`). `today` is injected (the
 * GUI's authoring-time clock) so the function stays pure and testable. */
export function initialSampleValue(kind: AddFieldKind, today: string): SampleScalar {
  if (kind === 'number') {
    return 0;
  }
  if (kind === 'boolean') {
    return false;
  }
  if (kind === 'date') {
    return today;
  }
  return '';
}
