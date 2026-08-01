// The reverse of generation: projecting a definitions stub FROM the sample data
// (blank-start standalone, where no engineer schema exists).
//
// It is a RECOMPUTED projection — the data-item editor's definition edits layer
// on top as ops (`data/definitionsEdit.ts`), never by rewriting this output — and
// it is emitted through the ONE YAML serializer (never string-built), so a
// hostile params key name becomes a quoted scalar and can never inject
// structure.

import { parseTemplate, serializeTemplate } from '@shojiku/designer-core';
import { MAX_GEN_DEPTH } from './genWalk';
import { parseParams } from './model';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Infer one schema node from a JSON value (the stub projection). Keys come
 * from `Object.keys`, so `obj[key]` reads the own value even for a `__proto__`
 * data key (it shadows the accessor) — no prototype walk. */
function schemaFor(value: unknown, depth: number): Record<string, unknown> {
  if (depth > MAX_GEN_DEPTH) {
    return { type: 'string' };
  }
  if (Array.isArray(value)) {
    const first = value.length > 0 ? value[0] : undefined;
    const items = first === undefined ? { type: 'string' } : schemaFor(first, depth + 1);
    return { type: 'array', items };
  }
  const obj = record(value);
  if (obj !== undefined) {
    let properties: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      properties = { ...properties, [key]: schemaFor(obj[key], depth + 1) };
    }
    return { type: 'object', properties };
  }
  if (typeof value === 'number') {
    return { type: 'number', example: value };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', example: value };
  }
  if (typeof value === 'string') {
    return { type: 'string', example: value };
  }
  return { type: 'string' };
}

/** Project a definitions stub FROM the current sample data (workshop mode): a
 * recomputed view (the editor's edits ride on top as ops, never rewriting the
 * projection). Emitted through the YAML serializer so a
 * hostile params key becomes a quoted scalar and never injects structure.
 * Malformed params → a minimal empty-properties stub (still valid). */
export function inferDefinitions(paramsText: string): string {
  const root = parseParams(paramsText);
  let properties: Record<string, unknown> = {};
  if (root !== null) {
    for (const key of Object.keys(root)) {
      properties = { ...properties, [key]: schemaFor(root[key], 0) };
    }
  }
  const stub = { version: '0.2.0', type: 'object', properties };
  // JSON is valid YAML; round-tripping the stub through the ONE parser +
  // serializer yields canonical, correctly-quoted definitions YAML.
  return serializeTemplate(parseTemplate(JSON.stringify(stub)));
}
