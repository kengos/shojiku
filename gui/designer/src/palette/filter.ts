// The palette's search filter over the definitions view.

import type { PaletteGroup } from './model';

/** Case-insensitive substring filter over group label/id and field label/key.
 * A group-level hit keeps the whole group; otherwise only matching fields
 * survive (a group with no hits disappears). Plain `includes` — the query is
 * user input and never becomes a RegExp. */
export function filterGroups(
  groups: readonly PaletteGroup[],
  query: string,
): readonly PaletteGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return groups;
  }
  const out: PaletteGroup[] = [];
  for (const group of groups) {
    if (group.label.toLowerCase().includes(needle) || group.id.toLowerCase().includes(needle)) {
      out.push(group);
      continue;
    }
    const fields = group.fields.filter(
      (field) =>
        field.key.toLowerCase().includes(needle) || field.label.toLowerCase().includes(needle),
    );
    if (fields.length > 0) {
      out.push({ ...group, fields });
    }
  }
  return out;
}
