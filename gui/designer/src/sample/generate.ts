// The public sample-data generation API over the schema walk: a full document,
// a non-clobbering fill of the MISSING keys, the "what would fill?" probe the
// CTA's disabled state reads, and the fresh-key extension points the
// drag-to-bind / scaffold / paste flows call.
//
// Values come from an OpenAPI-shaped definitions schema through `genWalk`
// (`example` → `enum` → `ValueSynth` → type default, always clamped); the
// workshop mode stub projection in the other direction is `inferStub.ts`.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { generateRoot, genValue } from './genWalk';
import { parseParams, serializeParams } from './model';
import { baselineSynth, type ValueSynth } from './synth';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Generate a full params document from a definitions schema (the blank-start
 * "generate sample data" CTA, and the seed for a preset with no draft yet).
 * `null` definitions → an empty document (blank-start has no schema to fill;
 * the user then adds fields). */
export function generateParams(
  definitions: string | null,
  synth: ValueSynth = baselineSynth,
  locale = 'en',
): string {
  return serializeParams(generateRoot(definitions, synth, locale));
}

/** Fill MISSING top-level keys of the current params from the schema, keeping
 * every existing value untouched — the "generate sample data" CTA over a
 * document that may already carry user edits (non-clobbering; the empty-start
 * case reduces to a full generate over `{}`). */
export function fillMissingParams(
  paramsText: string,
  definitions: string | null,
  synth: ValueSynth = baselineSynth,
  locale = 'en',
): string {
  const root = parseParams(paramsText) ?? {};
  const generated = generateRoot(definitions, synth, locale);
  let out: Record<string, unknown> = { ...root };
  for (const key of Object.keys(generated)) {
    if (!Object.hasOwn(out, key)) {
      out = { ...out, [key]: generated[key] };
    }
  }
  return serializeParams(out);
}

/** The top-level schema keys ABSENT from the current params — what the
 * "generate" CTA would fill. Empty when the schema declares nothing new (the
 * data is complete) OR the definitions are absent/malformed. Reads only the
 * schema's property KEYS (no value generation), so it is cheap enough to drive
 * the CTA's disabled state each render, and proto-safe (own-key checks only). */
export function missingParamKeys(
  paramsText: string,
  definitions: string | null,
): readonly string[] {
  if (definitions === null) {
    return [];
  }
  const root = parseParams(paramsText) ?? {};
  let rootSchema: unknown;
  try {
    rootSchema = readTemplate(parseTemplate(definitions));
  } catch {
    return [];
  }
  const schema = record(rootSchema);
  const properties = schema === undefined ? undefined : record(schema.properties);
  if (properties === undefined) {
    return [];
  }
  return Object.keys(properties).filter((key) => !Object.hasOwn(root, key));
}

/** The result of extending params under a fresh key. */
export type ExtendResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'key_exists' | 'invalid_params' };

/** Add a value generated from `schema` under a FRESH top-level key — the
 * The drag-to-bind / scaffold extension point. Never clobbers an existing
 * value: extending an existing key is a typed refusal. */
export function extendParams(
  paramsText: string,
  key: string,
  schema: Record<string, unknown>,
  synth: ValueSynth = baselineSynth,
  locale = 'en',
): ExtendResult {
  const root = parseParams(paramsText);
  if (root === null) {
    return { ok: false, reason: 'invalid_params' };
  }
  if (Object.hasOwn(root, key)) {
    return { ok: false, reason: 'key_exists' };
  }
  const value = genValue(schema, key, locale, synth, 0);
  return { ok: true, text: serializeParams({ ...root, [key]: value }) };
}

/** Add an EXPLICIT value under a FRESH top-level key — the paste-import twin of
 * `extendParams`: the pasted rows are verbatim, not synth-generated, so
 * the value is supplied directly instead of derived from a schema. Same
 * fresh-key discipline (never clobbers) and the same YAML serializer, so a
 * hostile row key becomes an inert quoted scalar. */
export function extendParamsValue(paramsText: string, key: string, value: unknown): ExtendResult {
  const root = parseParams(paramsText);
  if (root === null) {
    return { ok: false, reason: 'invalid_params' };
  }
  if (Object.hasOwn(root, key)) {
    return { ok: false, reason: 'key_exists' };
  }
  return { ok: true, text: serializeParams({ ...root, [key]: value }) };
}
