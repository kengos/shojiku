// Pure helpers behind the data-item editor's view: the selection-id separator,
// the definition→widget-kind mapping, the type/kind label tables, and the params
// readers the panes share, and the sample-value commit. DOM-free and Designer-free, so the hostile arms (a
// params leaf that is not a scalar, an array key that holds something else) are
// unit-testable without rendering.

import { addSampleField, setSampleValue } from '../sample/edit';
import { coerceSampleValue, parseParams, type SampleKind, type SamplePath } from '../sample/model';
import type { DefinitionType } from './definitionsEdit';
import type { AddKind } from './defsPlan';

/** The separator joining a tree node's keys path into its selection id.
 *
 * U+0000 is the least-collidable practical choice: a PLAIN YAML key cannot hold
 * it, so no ordinary keys path forges another's id. It is not a hard guarantee —
 * a double-quoted key may spell `\0` — which is why the id stays DISPLAY-ONLY:
 * the selection resolves to a tree node and every op addresses the document
 * through that node's `keysPath`, never through this string. Keep it that way. The separator is written as an ESCAPE; a literal NUL byte in
 * the source would classify the file as binary and drop it out of every
 * recursive grep. */
export const SELECTION_SEP = '\u0000';

/** The picker's type options: the closed scalar vocabulary, labeled by the palette
 * type keys where they exist plus one dedicated `data.type.integer`. */
export const TYPE_OPTION_KEY: Record<DefinitionType, string> = {
  string: 'palette.type.string',
  number: 'palette.type.number',
  integer: 'data.type.integer',
  boolean: 'palette.type.boolean',
};

/** The add form's kind options: the scalar types plus the three containers. */
export const KIND_OPTION_KEY: Record<AddKind, string> = {
  ...TYPE_OPTION_KEY,
  group: 'data.kind.group',
  // The add form explains the two repeating kinds by example (a non-engineer
  // reads 表 and リスト as near synonyms); tree chips keep the short names.
  table: 'data.kindOption.table',
  list: 'data.kindOption.list',
};

/** Map a definition (type, format) to the sample widget kind. */
export function sampleKind(type: string, format: string): SampleKind {
  if (type === 'string') {
    if (format === 'date') {
      return 'date';
    }
    return format === 'date-time' ? 'datetime' : 'string';
  }
  if (type === 'number' || type === 'integer') {
    return 'number';
  }
  return type === 'boolean' ? 'boolean' : 'string';
}

/** Walk a params path (own-property guarded); `undefined` when any step is
 * missing or the wrong shape. */
function walkParams(params: string, path: SamplePath): unknown {
  let cur: unknown = parseParams(params);
  for (const seg of path) {
    if (typeof seg === 'number') {
      if (!Array.isArray(cur) || seg < 0 || seg >= cur.length) {
        return undefined;
      }
      cur = cur[seg];
    } else if (
      typeof cur === 'object' &&
      cur !== null &&
      !Array.isArray(cur) &&
      Object.hasOwn(cur, seg)
    ) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Read a scalar's display string at a params path; empty for a missing or
 * non-scalar leaf. Exported so its hostile branches (a numeric segment out of an
 * array's range, a non-object mid-path) are unit-testable. */
export function readAt(params: string, path: SamplePath): string {
  const cur = walkParams(params, path);
  if (typeof cur === 'string') {
    return cur;
  }
  return typeof cur === 'number' || typeof cur === 'boolean' ? String(cur) : '';
}

/** The row count of the array at a params path (0 when absent / not an array). */
export function arrayLength(params: string, path: SamplePath): number {
  const arr = walkParams(params, path);
  return Array.isArray(arr) ? arr.length : 0;
}

/** The params after committing a sample value: a fresh top-level scalar is
 * CREATED (a field added to definitions has no params value yet); an existing
 * leaf is set in place. The same text when nothing changed. */
export function commitSampleValue(
  params: string,
  path: SamplePath,
  kind: SampleKind,
  raw: string,
): string {
  const value = coerceSampleValue(kind, raw);
  const root = parseParams(params);
  if (
    path.length === 1 &&
    typeof path[0] === 'string' &&
    root !== null &&
    !Object.hasOwn(root, path[0])
  ) {
    return addSampleField(params, path[0], value);
  }
  return setSampleValue(params, path, value);
}
