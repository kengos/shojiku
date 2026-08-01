// The blank-start side of a scaffold: the field-kind quintet the create forms
// offer, the schema `extendParams` generates sample rows from, and the spec a
// typed-inline form yields. Framework-free; a field NAME is untrusted user
// text, so every map it keys is rebuilt by spread with a computed key.

import { MAX_SCAFFOLD_FIELDS, type ScaffoldSpec, type ScaffoldVariant } from './scaffold';

/** The blank-start field kinds (the picking-is-safe quintet the add-field form
 * shares); a closed union — kind → schema mapping is a switch, never an
 * object-table lookup a hostile string could walk. `currency` is a `number`
 * refined by `format: currency` (the display code rides the field's
 * `currency:` / template `defaults.currency` chain — never set here). */
export type FieldKind = 'text' | 'number' | 'currency' | 'date' | 'boolean';

/** The quintet in the order the create forms offer it. Enumerating the closed
 * union next to its own definition keeps the two dialogs from each carrying a
 * copy that can drift from the type. */
export const FIELD_KINDS: readonly FieldKind[] = ['text', 'number', 'currency', 'date', 'boolean'];

export interface ScaffoldField {
  readonly name: string;
  readonly kind: FieldKind;
}

function kindSchema(kind: FieldKind): Record<string, unknown> {
  switch (kind) {
    case 'text':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'currency':
      return { type: 'number', format: 'currency' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'boolean':
      return { type: 'boolean' };
  }
}

/** Blank-start sample rows to generate: the `extendParams` schema for the
 * fresh source key. Lists enumerate scalars (a blank-start list is a simple
 * enumeration — field names need not ride the interpolation charset); tables
 * and cards get one object row shape from the form's fields. */
export function scaffoldSchema(
  fields: readonly ScaffoldField[],
  variant: ScaffoldVariant,
): Record<string, unknown> {
  if (variant === 'list') {
    return { type: 'array', minItems: 3, items: { type: 'string' } };
  }
  let properties: Record<string, unknown> = {};
  for (const field of fields.slice(0, MAX_SCAFFOLD_FIELDS)) {
    // Spread + computed key: a `__proto__` field name stays inert own data.
    properties = { ...properties, [field.name]: kindSchema(field.kind) };
  }
  return { type: 'array', minItems: 3, items: { type: 'object', properties } };
}

/** The blank-start spec: the typed names are both keys and labels (the
 * template carries the labels; the generated rows carry the keys). */
export function scaffoldFromFields(
  sourceKey: string,
  fields: readonly ScaffoldField[],
  variant: ScaffoldVariant,
): ScaffoldSpec {
  if (variant === 'list') {
    return { sourceKey, columns: [] };
  }
  const columns = fields.slice(0, MAX_SCAFFOLD_FIELDS).map((field) => ({
    key: field.name,
    label: field.name,
    // A currency field shows its symbol from the first preview: the engine
    // coerces a number + `symbol` pick to the currency type.
    ...(field.kind === 'currency' ? { format: 'symbol' } : {}),
  }));
  return { sourceKey, columns };
}
