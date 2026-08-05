// The usage index the palette looks fields up in: which item paths each
// binding key is bound at. Real `Map`s throughout — binding keys are
// attacker-influenced strings, so a plain object would let `__proto__` and
// friends behave as keys.

import type { BindingRef } from './bindings';
import type { PaletteGroup } from './model';

/** The usage index the palette looks fields up in. Maps (never plain objects
 * — binding keys are attacker-influenced strings like `__proto__`) from
 * binding key to the item paths bound to it. */
export interface UsageIndex {
  /** Document-scope value bindings, by full key (`order.code`). */
  readonly scalar: ReadonlyMap<string, readonly string[]>;
  /** Document-scope array sources, by array key (an array group's id). */
  readonly sources: ReadonlyMap<string, readonly string[]>;
  /** Row-relative bindings: scope key → field key → paths. */
  readonly rows: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
}

function push(map: Map<string, string[]>, key: string, path: string): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [path]);
  } else {
    list.push(path);
  }
}

/** Fold collected bindings into the palette's lookup index. */
export function buildUsage(bindings: readonly BindingRef[]): UsageIndex {
  const scalar = new Map<string, string[]>();
  const sources = new Map<string, string[]>();
  const rows = new Map<string, Map<string, string[]>>();
  for (const binding of bindings) {
    if (binding.scope === null) {
      push(binding.source ? sources : scalar, binding.key, binding.path);
      continue;
    }
    let rowMap = rows.get(binding.scope);
    if (rowMap === undefined) {
      rowMap = new Map();
      rows.set(binding.scope, rowMap);
    }
    push(rowMap, binding.key, binding.path);
  }
  return { scalar, sources, rows };
}

/** The paths where a field is bound: an array group's field matches
 * row-relative bindings under that group's source key; a scalar group's field
 * matches document-scope bindings on its full key. */
export function fieldUsage(
  usage: UsageIndex,
  group: PaletteGroup,
  fieldKey: string,
): readonly string[] {
  if (group.isArray) {
    return usage.rows.get(group.id)?.get(fieldKey) ?? [];
  }
  return usage.scalar.get(fieldKey) ?? [];
}

/** The paths where an ARRAY group is bound as a data source (`table`/
 * `repeat`/`repeat_flow`/`list` `data.key` == the group id). A group the
 * rows of another carry is bound ROW-RELATIVELY, so its usage sits in its
 * parent's row map under the trailing key — reading it as a document-scope
 * source would report every such group as unused. Scalar groups are display
 * grouping only: no group-level binding exists. */
export function groupUsage(usage: UsageIndex, group: PaletteGroup): readonly string[] {
  if (!group.isArray) {
    return [];
  }
  if (group.rowScope === undefined) {
    return usage.sources.get(group.id) ?? [];
  }
  return usage.rows.get(group.rowScope)?.get(group.id.slice(group.rowScope.length + 1)) ?? [];
}
