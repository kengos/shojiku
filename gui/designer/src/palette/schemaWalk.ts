// The definitions schema walk: one OpenAPI-schema node → the palette's field
// and group rows. Depth- and count-bounded — a hostile definitions file must
// not fill the DOM or recurse without end. Nested array properties surface as
// their own groups; arrays inside array rows are engine-rejected, so the
// display walk simply skips them.

import { MAX_PALETTE_FIELDS, MAX_WALK_DEPTH } from './caps';
import { clip, displayType, enumOptions, record, sampleDisplay, text } from './fieldDisplay';
import type { PaletteField, PaletteGroup } from './model';

export function leafField(
  key: string,
  fallbackLabel: string,
  schema: Record<string, unknown>,
): PaletteField {
  const label = text(schema.title);
  return {
    key,
    label: label === '' ? clip(fallbackLabel) : label,
    type: displayType(schema.type, schema.format),
    description: text(schema.description),
    sample: sampleDisplay(schema.example),
    enumOptions: enumOptions(schema.enum),
  };
}

/** Collects an object schema's leaf fields into `fields` (dotted full keys,
 * labels falling back to the group-relative key) and surfaces nested array
 * properties as their own groups. Depth- and count-bounded. */
export function collectFields(
  fields: PaletteField[],
  nestedArrays: PaletteGroup[],
  groupRoot: string,
  prefix: string,
  schema: Record<string, unknown>,
  depth: number,
): void {
  if (depth > MAX_WALK_DEPTH) {
    return;
  }
  const properties = record(schema.properties);
  if (properties === undefined) {
    return;
  }
  for (const name of Object.keys(properties)) {
    if (fields.length >= MAX_PALETTE_FIELDS) {
      return;
    }
    const child = record(properties[name]);
    if (child === undefined) {
      continue;
    }
    const fullKey = `${prefix}.${name}`;
    if (child.type === 'array') {
      nestedArrays.push(arrayGroup(fullKey, child));
    } else if (child.type === 'object') {
      collectFields(fields, nestedArrays, groupRoot, fullKey, child, depth + 1);
    } else {
      fields.push(leafField(fullKey, fullKey.slice(groupRoot.length + 1), child));
    }
  }
}

/** Collects an array row schema's leaf fields (row-relative dotted keys).
 * Arrays inside rows are engine-rejected; the display walk just skips them. */
function collectRowFields(
  fields: PaletteField[],
  prefix: string,
  schema: Record<string, unknown>,
  depth: number,
): void {
  if (depth > MAX_WALK_DEPTH) {
    return;
  }
  const properties = record(schema.properties);
  if (properties === undefined) {
    return;
  }
  for (const name of Object.keys(properties)) {
    if (fields.length >= MAX_PALETTE_FIELDS) {
      return;
    }
    const child = record(properties[name]);
    if (child === undefined) {
      continue;
    }
    const key = prefix === '' ? name : `${prefix}.${name}`;
    if (child.type === 'object') {
      collectRowFields(fields, key, child, depth + 1);
    } else if (child.type !== 'array') {
      fields.push(leafField(key, key, child));
    }
  }
}

export function arrayGroup(id: string, schema: Record<string, unknown>): PaletteGroup {
  const fields: PaletteField[] = [];
  const row = record(schema.items);
  if (row !== undefined && row.type === 'object') {
    collectRowFields(fields, '', row, 0);
  }
  const label = text(schema.title);
  return {
    id,
    label: label === '' ? clip(id) : label,
    description: text(schema.description),
    isArray: true,
    fields,
  };
}
