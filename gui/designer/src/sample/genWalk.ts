// The schema walk that produces sample values: one leaf at a time (`example` →
// `enum` member → `ValueSynth` → type default, then clamped), and the recursive
// object/array descent that assembles a params root from a definitions schema.
//
// Every unbounded dimension a hostile schema controls is capped here — walk
// depth, generated row count, enum choices — so a schema demanding a billion
// rows generates the cap rather than exhausting memory. The public generation
// API over this walk lives in `generate.ts`.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { enumMember } from '../palette/fieldDisplay';
import { clampLeaf, coerceToType, constraintsOf } from './genConstraints';
import { baselineSynth, hashKey, type ValueSynth } from './synth';

/** Hard bounds so a hostile schema can never drive unbounded work. */
export const MAX_GENERATED_ROWS = 20;
export const DEFAULT_ROWS = 3;
export const MAX_ENUM_PICK = 256;
export const MAX_GEN_DEPTH = 32;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Generate a leaf value: `example` → `enum` (seeded pick) → synth → clamp. */
function genLeaf(
  schema: Record<string, unknown>,
  keyPath: string,
  locale: string,
  synth: ValueSynth,
): unknown {
  if (Object.hasOwn(schema, 'example')) {
    return coerceToType(schema.example, schema.type);
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    // A member may be authored as a `{ value, label }` pair; the label is
    // display words, so the sample takes the VALUE — and takes it in its
    // declared type, which is why this narrows the member rather than
    // reusing the palette's display strings.
    const choices: unknown[] = [];
    for (const member of schema.enum.slice(0, MAX_ENUM_PICK)) {
      const parsed = enumMember(member);
      if (parsed !== undefined) {
        choices.push(parsed.value);
      }
    }
    if (choices.length > 0) {
      return choices[hashKey(keyPath) % choices.length];
    }
  }
  const type = typeof schema.type === 'string' ? schema.type : 'string';
  const format = typeof schema.format === 'string' ? schema.format : undefined;
  const constraints = constraintsOf(schema);
  const spec = { type, format, keyPath, locale, constraints };
  let value: unknown;
  try {
    value = synth(spec);
  } catch {
    value = baselineSynth(spec);
  }
  return clampLeaf(value, constraints);
}

function rowCount(schema: Record<string, unknown>): number {
  const min = num(schema.minItems);
  if (min === undefined) {
    return DEFAULT_ROWS;
  }
  return Math.max(1, Math.min(Math.floor(min), MAX_GENERATED_ROWS));
}

/** Generate a value for any schema node (object / array / leaf), depth-bounded. */
export function genValue(
  schema: Record<string, unknown>,
  keyPath: string,
  locale: string,
  synth: ValueSynth,
  depth: number,
): unknown {
  if (depth > MAX_GEN_DEPTH) {
    return null;
  }
  if (schema.type === 'object') {
    const properties = record(schema.properties);
    let out: Record<string, unknown> = {};
    if (properties !== undefined) {
      for (const name of Object.keys(properties)) {
        const child = record(properties[name]);
        if (child !== undefined) {
          const childKey = keyPath === '' ? name : `${keyPath}.${name}`;
          out = { ...out, [name]: genValue(child, childKey, locale, synth, depth + 1) };
        }
      }
    }
    return out;
  }
  if (schema.type === 'array') {
    const items = record(schema.items);
    const count = rowCount(schema);
    const rows: unknown[] = [];
    for (let i = 0; i < count; i += 1) {
      rows.push(
        items === undefined ? null : genValue(items, `${keyPath}[${i}]`, locale, synth, depth + 1),
      );
    }
    return rows;
  }
  return genLeaf(schema, keyPath, locale, synth);
}

/** Generate the params root object from a definitions schema. `null`
 * definitions (or a malformed / property-less schema) → an empty object. */
export function generateRoot(
  definitions: string | null,
  synth: ValueSynth,
  locale: string,
): Record<string, unknown> {
  if (definitions === null) {
    return {};
  }
  let root: unknown;
  try {
    root = readTemplate(parseTemplate(definitions));
  } catch {
    return {};
  }
  const schema = record(root);
  if (schema === undefined || record(schema.properties) === undefined) {
    return {};
  }
  return genValue(
    { type: 'object', properties: schema.properties },
    '',
    locale,
    synth,
    0,
  ) as Record<string, unknown>;
}
