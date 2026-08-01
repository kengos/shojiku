// Display narrowing for the palette's UNTRUSTED sources: definitions text is
// host-supplied in hosted mode, so every string that reaches the DOM is
// clipped and every list is capped. Shared by the definitions walk
// (`model.ts`), the template walk (`bindings.ts`) and the two panel models
// that mirror the engine's type table (`panel/pickerModel`, `panel/formatModel`).

import { MAX_ENUM_OPTIONS, MAX_TEXT_CHARS } from './caps';

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function clip(value: string): string {
  return value.length > MAX_TEXT_CHARS ? `${value.slice(0, MAX_TEXT_CHARS)}…` : value;
}

export function text(value: unknown): string {
  return typeof value === 'string' ? clip(value) : '';
}

/** A sample value's display string: strings verbatim, numbers/booleans
 * stringified, containers as bounded JSON. Everything is clipped — a hostile
 * sample must not weigh down the DOM. Exported so the hostile branches are
 * unit-testable directly. */
export function sampleDisplay(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return clip(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return clip(JSON.stringify(value));
  } catch {
    // Circular structure (YAML anchors can express one within the alias cap).
    return '';
  }
}

/** The mapped display-type name for one schema node, mirroring the engine's
 * `(type, format)` → field-type table: known semantic formats refine the
 * base, unknown formats are generation hints and keep it, and an unknown
 * base type shows verbatim (clipped). The result feeds the component's
 * CLOSED `palette.type.*` label map — a document string never composes a
 * catalog key. */
export function displayType(base: unknown, format: unknown): string {
  const baseName = typeof base === 'string' ? base : '';
  const hint = typeof format === 'string' ? format : '';
  if (baseName === 'string') {
    if (hint === 'date-time') {
      return 'datetime';
    }
    return hint === 'date' || hint === 'image' ? hint : 'string';
  }
  if (baseName === 'number' || baseName === 'integer') {
    return hint === 'currency' || hint === 'percentage' || hint === 'quantity' ? hint : 'number';
  }
  return clip(baseName);
}

/** One `enum` member as the editors offer it: the params value it declares,
 * beside the words that value displays as (empty when it declares none). */
export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

/** One declared `enum` member, split into the params value it declares and
 * the words that value displays as. The ONE place the member's two authored
 * forms — a bare scalar, or a `{ value, label }` pair — are understood; every
 * reader narrows this rather than re-reading the shape.
 *
 * `undefined` for anything the engine would reject or could never match: a
 * container value, a non-string label, a pair missing its `value`. Own
 * properties only, so a `__proto__` member stays inert. */
export function enumMember(
  member: unknown,
): { readonly value: string | number | boolean; readonly label: string } | undefined {
  const scalar = (value: unknown, label: string) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? { value, label }
      : undefined;
  const pair = record(member);
  if (pair === undefined) {
    return scalar(member, '');
  }
  if (!Object.hasOwn(pair, 'value')) {
    return undefined;
  }
  const label = Object.hasOwn(pair, 'label') ? pair.label : '';
  return typeof label === 'string' ? scalar(pair.value, clip(label)) : undefined;
}

/** A schema's declared `enum` as bounded display options: each member's value
 * as a display string, beside its declared label (empty when the member
 * declares none). Malformed members are dropped and the list is capped — a
 * hostile definitions file must not fill a select. */
export function enumOptions(declared: unknown): readonly EnumOption[] {
  if (!Array.isArray(declared)) {
    return [];
  }
  const out: EnumOption[] = [];
  for (const member of declared) {
    if (out.length >= MAX_ENUM_OPTIONS) {
      break;
    }
    const parsed = enumMember(member);
    if (parsed !== undefined) {
      out.push({
        value: typeof parsed.value === 'string' ? clip(parsed.value) : String(parsed.value),
        label: parsed.label,
      });
    }
  }
  return out;
}

/** A schema's declared `enum` as bounded display strings — the VALUES, which
 * is what an `equals` literal and a condition's wire carry. */
export function enumValues(declared: unknown): readonly string[] {
  return enumOptions(declared).map((option) => option.value);
}
