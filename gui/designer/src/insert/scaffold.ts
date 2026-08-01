// The iterable scaffold's SPEC vocabulary: what an array data source becomes
// before any presentation is chosen — the row fields, the caps that bound a
// hostile schema, and which presentation variants a spec can honestly offer.
// `scaffoldSnippet.ts` realizes a spec + variant as one `insertItem` value,
// `scaffoldFields.ts` builds a spec from a blank-start form, and
// `iterableTarget.ts` decides where the result lands. Framework-free; every
// input string is untrusted definitions/user text and stays inert data through
// designer-core's validated `SnippetValue` path.

import type { PaletteGroup } from '../palette/model';

/** Hostile-definitions bound: a scaffold takes at most this many fields (a
 * 256-field schema must not become a 256-column table). First fields win. */
export const MAX_SCAFFOLD_FIELDS = 16;

export type ScaffoldVariant = 'table' | 'repeat_flow' | 'list';

export interface ScaffoldColumn {
  /** The row-relative binding key (`data.key` inside the scaffold). */
  readonly key: string;
  /** The header/label text; falls back to the key when empty. */
  readonly label: string;
  /** Optional display format on the column's `data` (`data.format`) — the
   * paste import and the blank-start currency kind set `symbol` on money columns.
   * Omitted = no format, so other callers' snippet output is unchanged. */
  readonly format?: string;
}

export interface ScaffoldSpec {
  /** The array params key the scaffold binds (`data.key` on the item). */
  readonly sourceKey: string;
  /** Row fields, in order. Empty = a scalar-entry array (list only). */
  readonly columns: readonly ScaffoldColumn[];
}

/** The spec an array palette group yields: image-typed fields are excluded
 * (a URI-as-text column and per-row asset loads are the follow-up asset
 * pipeline's turf), and the field count is capped. */
export function scaffoldFromGroup(group: PaletteGroup): ScaffoldSpec {
  const columns = group.fields
    .filter((field) => field.type !== 'image')
    .slice(0, MAX_SCAFFOLD_FIELDS)
    .map((field) => ({ key: field.key, label: field.label === '' ? field.key : field.label }));
  return { sourceKey: group.id, columns };
}

/** The variants a spec supports: field-less (scalar-row) sources render only
 * as a list; anything with fields offers all three. */
export function variantsFor(spec: ScaffoldSpec): readonly ScaffoldVariant[] {
  return spec.columns.length === 0 ? ['list'] : ['table', 'repeat_flow', 'list'];
}

/** The variant a palette-group canvas drop inserts without asking: the table
 * (the dominant presentation), or the list when the group has no fields. */
export function defaultVariantFor(spec: ScaffoldSpec): ScaffoldVariant {
  return spec.columns.length === 0 ? 'list' : 'table';
}
