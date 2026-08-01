// The READ side of the params document: the schema lookup that labels and types
// each leaf, and the walk that turns params JSON into the editable view the data
// editor renders.
//
// Labels/types come from the SAME parse the field palette uses
// (`readDefinitionsView`) — one schema reader, no parallel walk. Absent
// definitions, kinds are inferred from the JSON values, so blank-start data is
// still editable. Every walk is depth- and count-bounded and reads own
// properties only, so hostile params can bloat neither the DOM nor the stack.

import type { EnumOption } from '../palette/fieldDisplay';
import { type PaletteGroup, readDefinitionsView } from '../palette/model';
import {
  display,
  inferKind,
  isRecord,
  kindFromType,
  MAX_FIELDS,
  MAX_ROWS_SHOWN,
  MAX_WALK_DEPTH,
  ownGet,
  parseParams,
  type SampleArrayGroup,
  type SampleField,
  type SampleGroup,
  type SampleKind,
  type SamplePath,
  type SampleRow,
  type SampleView,
} from './model';

interface FieldMeta {
  readonly label: string;
  readonly kind: SampleKind;
  readonly options: readonly EnumOption[];
}

/** The schema lookup: labels + kinds keyed by document path, reusing the field
 * palette's parse. Object-group leaves key by their dotted full key
 * (`invoice.number`); array-row leaves by `${arrayId}[]${rowKey}`; a group/array
 * label by its top-level id. Empty when no definitions are supplied. */
function buildMeta(definitions?: string): {
  groupLabel: Map<string, string>;
  field: Map<string, FieldMeta>;
} {
  const groupLabel = new Map<string, string>();
  const field = new Map<string, FieldMeta>();
  if (definitions === undefined) {
    return { groupLabel, field };
  }
  const groups: readonly PaletteGroup[] | null = readDefinitionsView(definitions);
  if (groups === null) {
    return { groupLabel, field };
  }
  for (const group of groups) {
    if (group.id !== '') {
      groupLabel.set(group.id, group.label);
    }
    for (const f of group.fields) {
      const key = group.isArray ? `${group.id}[]${f.key}` : f.key;
      field.set(key, { label: f.label, kind: kindFromType(f.type), options: f.enumOptions });
    }
  }
  return { groupLabel, field };
}

function makeField(
  path: SamplePath,
  metaKey: string,
  fallbackLabel: string,
  value: unknown,
  meta: Map<string, FieldMeta>,
): SampleField {
  const m = meta.get(metaKey);
  return {
    path,
    label: m?.label ?? fallbackLabel,
    kind: m?.kind ?? inferKind(value),
    value: display(value),
    options: m?.options ?? [],
  };
}

/** Collect an object's scalar leaves (flattening nested objects to dotted
 * meta keys); nested arrays are surfaced only at the top level, so they are
 * skipped here. */
function collectLeaves(
  out: SampleField[],
  obj: Record<string, unknown>,
  path: SamplePath,
  dotted: string,
  meta: Map<string, FieldMeta>,
  depth: number,
): void {
  if (depth > MAX_WALK_DEPTH) {
    return;
  }
  for (const key of Object.keys(obj)) {
    if (out.length >= MAX_FIELDS) {
      return;
    }
    const child = ownGet(obj, key);
    const childPath = [...path, key];
    // `dotted` is always the group root (a top-level key) or a deeper prefix —
    // never empty — so the dotted meta key is unconditional.
    const childDotted = `${dotted}.${key}`;
    if (isRecord(child)) {
      collectLeaves(out, child, childPath, childDotted, meta, depth + 1);
    } else if (!Array.isArray(child)) {
      out.push(makeField(childPath, childDotted, key, child, meta));
    }
  }
}

function arrayGroup(
  key: string,
  arr: readonly unknown[],
  meta: Map<string, FieldMeta>,
  labels: Map<string, string>,
): SampleArrayGroup {
  const rows: SampleRow[] = [];
  for (let i = 0; i < arr.length && i < MAX_ROWS_SHOWN; i += 1) {
    const el = arr[i];
    const fields: SampleField[] = [];
    if (isRecord(el)) {
      for (const rowKey of Object.keys(el)) {
        if (fields.length >= MAX_FIELDS) {
          break;
        }
        const child = ownGet(el, rowKey);
        if (!isRecord(child) && !Array.isArray(child)) {
          fields.push(makeField([key, i, rowKey], `${key}[]${rowKey}`, rowKey, child, meta));
        }
      }
    } else if (!Array.isArray(el)) {
      fields.push(makeField([key, i], `${key}[]`, '', el, meta));
    }
    rows.push({ path: [key, i], fields });
  }
  return { path: [key], label: labels.get(key) ?? key, rows };
}

/** Read the params text (with optional definitions for labels/types) into the
 * editable view, or `null` when the params do not parse to a JSON object (bad
 * JSON, an array/scalar root, or over the size cap). */
export function readSampleView(paramsText: string, definitions?: string): SampleView | null {
  const root = parseParams(paramsText);
  if (root === null) {
    return null;
  }
  const { groupLabel, field: fieldMeta } = buildMeta(definitions);
  const groups: SampleGroup[] = [];
  const arrays: SampleArrayGroup[] = [];
  const ungrouped: SampleField[] = [];
  for (const key of Object.keys(root)) {
    const value = ownGet(root, key);
    if (Array.isArray(value)) {
      arrays.push(arrayGroup(key, value, fieldMeta, groupLabel));
    } else if (isRecord(value)) {
      const fields: SampleField[] = [];
      collectLeaves(fields, value, [key], key, fieldMeta, 0);
      groups.push({ id: key, label: groupLabel.get(key) ?? key, fields });
    } else {
      ungrouped.push(makeField([key], key, key, value, fieldMeta));
    }
  }
  if (ungrouped.length > 0) {
    groups.unshift({ id: '', label: '', fields: ungrouped });
  }
  return { groups, arrays };
}
