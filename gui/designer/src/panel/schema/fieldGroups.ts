// How the catalog-driven section orders and heads its fields. The catalog
// lists keys alphabetically by wire name, which reads as no order at all, so
// the Designer keeps one table of key → group — the only table of key names
// the section has, held by a partition test against every key a style
// disclosure can list. A key in no group (an item's own key) comes first, in
// catalog order, under no heading.

/** One group: its heading (none for the last, which sits under a rule) and its
 * keys in display order. */
export interface FieldGroup {
  readonly titleKey: string | undefined;
  readonly keys: readonly string[];
}

export const FIELD_GROUPS: readonly FieldGroup[] = [
  { titleKey: 'panel.schema.group.spacing', keys: ['letterSpacing', 'textDecoration'] },
  {
    titleKey: 'panel.schema.group.border',
    keys: ['borderWidth', 'borderStyle', 'borderColor', 'borderRadius'],
  },
  {
    titleKey: 'panel.schema.group.position',
    keys: ['verticalAlign', 'textOverflow', 'overflow'],
  },
  {
    titleKey: 'panel.schema.group.vertical',
    keys: [
      'writingMode',
      'textOrientation',
      'textCombineUpright',
      'lineBreak',
      'textSpacingTrim',
      'hangingPunctuation',
    ],
  },
  // A 透明度 heading would read inverted over an opacity value, so opacity
  // closes the list under a rule with no heading.
  { titleKey: undefined, keys: ['opacity'] },
];

/** One drawn block of fields. `ruled`: a rule above it, for a block with no
 * heading that follows another. */
export interface FieldBlock<T> {
  readonly titleKey: string | undefined;
  readonly ruled: boolean;
  readonly items: readonly T[];
}

/** `items` in blocks: the ungrouped ones first, then each group with at least
 * one item, its items in the group's order. */
export function blocksOf<T>(items: readonly T[], keyOf: (item: T) => string): FieldBlock<T>[] {
  const grouped = new Set(FIELD_GROUPS.flatMap((group) => group.keys));
  const blocks: { titleKey: string | undefined; items: readonly T[] }[] = [
    { titleKey: undefined, items: items.filter((item) => !grouped.has(keyOf(item))) },
    ...FIELD_GROUPS.map((group) => ({
      titleKey: group.titleKey,
      items: group.keys.flatMap((key) => items.filter((item) => keyOf(item) === key)),
    })),
  ];
  return blocks
    .filter((block) => block.items.length > 0)
    .map((block, index) => ({ ...block, ruled: index > 0 && block.titleKey === undefined }));
}

/** `items` in rows: two short items in a row pair up, anything else takes a
 * row to itself. */
export function rowsOf<T>(items: readonly T[], short: (item: T) => boolean): T[][] {
  const rows: T[][] = [];
  for (const item of items) {
    const last = rows.at(-1);
    if (last !== undefined && last.length === 1 && short(last[0]) && short(item)) {
      last.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows;
}
