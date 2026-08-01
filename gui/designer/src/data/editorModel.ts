// Pure helpers behind the data-item editor's view: the list selection key, the
// definition→widget-kind mapping, the type-picker label table, and the params
// readers the panes share. DOM-free and Designer-free, so the hostile arms (a
// params leaf that is not a scalar, an array key that holds something else) are
// unit-testable without rendering.

import { parseParams, type SampleKind, type SamplePath } from '../sample/model';
import type { DefinitionType } from './definitionsEdit';

/** The composite-key separator joining a group id to a field key.
 *
 * U+0000 is the least-collidable practical choice: a PLAIN YAML key cannot hold
 * it, so no ordinary group id / field key pair forges another pair's key. It is
 * not a hard guarantee — a double-quoted key may spell `\0` — which is why this
 * key stays DISPLAY-ONLY: the selection resolves to `{group, field}` objects and
 * every op addresses the document through those, never through this string.
 * Keep it that way. The separator is written as an ESCAPE; a literal NUL byte in
 * the source would classify the file as binary and drop it out of every
 * recursive grep. */
export const SELECTION_SEP = '\u0000';

/** The list selection's identity for one field: the only consumer is the
 * editor's own selection state (no write path derives a document address from
 * it — ops route through the resolved group/field objects). */
export function selectionKey(groupId: string, fieldKey: string): string {
  return `${groupId}${SELECTION_SEP}${fieldKey}`;
}

/** The picker's type options: the closed scalar vocabulary, labeled by the palette
 * type keys where they exist plus one dedicated `data.type.integer`. */
export const TYPE_OPTION_KEY: Record<DefinitionType, string> = {
  string: 'palette.type.string',
  number: 'palette.type.number',
  integer: 'data.type.integer',
  boolean: 'palette.type.boolean',
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

/** Read a scalar's display string at a params path (own-property guarded); empty
 * for a missing or non-scalar leaf. Exported so its hostile branches (a numeric
 * segment out of an array's range, a non-object mid-path) are unit-testable. */
export function readAt(params: string, path: SamplePath): string {
  const root = parseParams(params);
  let cur: unknown = root;
  for (const seg of path) {
    if (typeof seg === 'number') {
      if (!Array.isArray(cur) || seg < 0 || seg >= cur.length) {
        return '';
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
      return '';
    }
  }
  if (typeof cur === 'string') {
    return cur;
  }
  return typeof cur === 'number' || typeof cur === 'boolean' ? String(cur) : '';
}

/** The row count of a top-level array (0 when absent / not an array). */
export function arrayLength(params: string, key: string): number {
  const root = parseParams(params);
  const arr = root !== null && Object.hasOwn(root, key) ? root[key] : undefined;
  return Array.isArray(arr) ? arr.length : 0;
}
