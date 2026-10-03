// The ONE raw read of a definitions schema node at a keys path, shared by the
// field metadata reads (`definitionsEdit.ts`) and the value-rule reads
// (`valueRules.ts`, `enumModel.ts`). Own-property guarded and never throws: a
// missing node, a hostile prototype segment, or unparseable definitions all read
// as `undefined`.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The schema map at `keysPath`, or `undefined`. */
export function readSchemaNode(
  defsText: string,
  keysPath: readonly string[],
): Record<string, unknown> | undefined {
  let node: unknown;
  try {
    node = readTemplate(parseTemplate(defsText));
  } catch {
    return undefined;
  }
  for (const key of keysPath) {
    const rec = record(node);
    if (rec === undefined || !Object.hasOwn(rec, key)) {
      return undefined;
    }
    node = rec[key];
  }
  return record(node);
}

/** An own property of a schema node (`undefined` when absent or inherited). */
export function own(schema: Record<string, unknown> | undefined, key: string): unknown {
  return schema !== undefined && Object.hasOwn(schema, key) ? schema[key] : undefined;
}
