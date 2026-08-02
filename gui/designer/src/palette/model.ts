// Pure palette model: the read-only view of `definitions.yml` (the engineer's
// data dictionary the PM designs against). Definitions are NEVER edited here —
// the palette dispatches no ops — so this model is display-only narrowing over
// designer-core's capped materialization (`parseTemplate`/`readTemplate` carry
// the size and alias-bomb guards). Hostile or malformed input degrades to an
// empty view; the engine's `validate` remains the real error surface for bad
// definitions.
//
// The per-value display narrowing lives in `fieldDisplay.ts`, the schema walk
// in `schemaWalk.ts`, the template walk in `bindings.ts`, the usage index in
// `usage.ts` and the search filter in `filter.ts`.

import { parseTemplate, readTemplate } from '@shojiku/designer-core';
import { MAX_PALETTE_FIELDS, MAX_PALETTE_GROUPS } from './caps';
import type { EnumOption } from './fieldDisplay';
import { clip, record, text } from './fieldDisplay';
import { arrayGroup, collectFields, leafField } from './schemaWalk';

export interface PaletteField {
  readonly key: string;
  readonly label: string;
  /** The wire type name (`string`, `date`, …) — displayed via a localized
   * label when known, verbatim (clipped) when not. */
  readonly type: string;
  readonly description: string;
  /** The sample value's bounded display string; empty when unset. */
  readonly sample: string;
  /** The declared `enum` members as display options — each value beside the
   * words it displays as (empty label when the member declares none). A
   * closed value set the editors offer as a choice instead of free entry.
   * Bounded: hostile lists are truncated, malformed members dropped. */
  readonly enumOptions: readonly EnumOption[];
}

export interface PaletteGroup {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** A repeating group (the table/repeat/list data source). */
  readonly isArray: boolean;
  readonly fields: readonly PaletteField[];
}

/** Narrow definitions source text (the OpenAPI-schema shape) to the
 * palette's display view. `null` when the text does not parse to a map with
 * a `properties` map (over the size cap, malformed YAML, an alias bomb, the
 * retired v1 `groups` form) — the palette shows its empty state. A top-level
 * object property is a group (nested arrays surface as their own groups); a
 * top-level array property is an array group; top-level scalars gather into
 * one leading unlabeled group (`id`/`label` empty — the component shows the
 * localized "ungrouped" heading). Entries are tolerated field-by-field. */
export function readDefinitionsView(source: string): readonly PaletteGroup[] | null {
  let raw: unknown;
  try {
    raw = readTemplate(parseTemplate(source));
  } catch {
    return null;
  }
  const properties = record(record(raw)?.properties);
  if (properties === undefined) {
    return null;
  }
  const groups: PaletteGroup[] = [];
  const ungrouped: PaletteField[] = [];
  for (const name of Object.keys(properties).slice(0, MAX_PALETTE_GROUPS)) {
    const schema = record(properties[name]);
    if (schema === undefined) {
      continue;
    }
    if (schema.type === 'array') {
      groups.push(arrayGroup(name, schema));
    } else if (schema.type === 'object') {
      const fields: PaletteField[] = [];
      const nestedArrays: PaletteGroup[] = [];
      collectFields(fields, nestedArrays, name, name, schema, 0);
      const label = text(schema.title);
      groups.push({
        id: name,
        label: label === '' ? clip(name) : label,
        description: text(schema.description),
        isArray: false,
        fields,
      });
      groups.push(...nestedArrays);
    } else {
      /* v8 ignore next 3 -- the name loop is sliced to MAX_PALETTE_GROUPS (= MAX_PALETTE_FIELDS today), so this cap cannot engage; kept against constant drift. */
      if (ungrouped.length >= MAX_PALETTE_FIELDS) {
        continue;
      }
      ungrouped.push(leafField(name, name, schema));
    }
  }
  if (ungrouped.length > 0) {
    groups.unshift({ id: '', label: '', description: '', isArray: false, fields: ungrouped });
  }
  return groups.slice(0, MAX_PALETTE_GROUPS);
}
