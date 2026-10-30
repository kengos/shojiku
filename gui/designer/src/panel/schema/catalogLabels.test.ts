// The words the catalog section shows, against the catalog it lists from: a
// key the engine adds to a surface must arrive with a label (else the section
// would show `panel.field.<key>`), every enum spelling a style surface offers
// with its localized wording, and the group table must partition exactly the
// keys a style disclosure can list. Every new string is in all six catalogs.

import { styleKeys, surfaceFields, surfaceKeys } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATALOG as CATALOG } from '../../i18n/catalog';
import { translate } from '../../i18n/render';
import { INHERITED_STYLE_FIELDS } from '../defaultsModel';
import { STYLE_FIELDS } from '../styleFieldSpecs';
import { styleOptionLabel } from '../styleLabels';
import { COMPOSITES } from './composites';
import { blocksOf, FIELD_GROUPS, rowsOf } from './fieldGroups';
import { editedField } from './widgets';

const en = CATALOG.en.chrome;
const t = (key: string, args?: Record<string, string | number>) =>
  translate(CATALOG, ['en'], key, 'en', args);

/** Every key a catalog section can be handed: each surface's whole list,
 * before the host takes away the keys it edits itself. */
const LISTABLE = [
  ...surfaceKeys({ kind: 'style' }),
  ...surfaceKeys({ kind: 'defaultsStyle' }),
  ...surfaceKeys({ kind: 'item', type: 'list' }),
];

describe('labels', () => {
  it('has an English label for every key a surface can list', () => {
    expect(LISTABLE.length).toBeGreaterThan(24);
    expect(LISTABLE.filter((key) => !Object.hasOwn(en, `panel.field.${key}`))).toEqual([]);
  });

  it('words every enum spelling a style surface offers', () => {
    const offered = surfaceFields({ kind: 'style' }, COMPOSITES).flatMap((field) => {
      const spec = editedField(field).spec;
      return spec.kind === 'enum' ? spec.values.map((value) => [field.key, value] as const) : [];
    });
    // Positive control: the enum keys of the style surface, border style included.
    expect(offered).toContainEqual(['borderStyle', 'dashed']);
    expect(offered).toContainEqual(['lineBreak', 'anywhere']);
    expect(offered.filter(([key, value]) => styleOptionLabel(t, key, value) === value)).toEqual([]);
  });

  it('carries every string the section added in all six languages', () => {
    const added = Object.keys(en).filter(
      (key) =>
        key.startsWith('panel.schema.') ||
        ['borderWidth', 'borderStyle', 'borderColor', 'borderRadius', 'textDecoration']
          .concat(['overflowText', 'bindings'])
          .some((field) => key === `panel.field.${field}`),
    );
    expect(added).toHaveLength(16);
    for (const [language, catalog] of Object.entries(CATALOG)) {
      expect([language, added.filter((key) => !Object.hasOwn(catalog.chrome, key))]).toEqual([
        language,
        [],
      ]);
    }
    expect(Object.keys(CATALOG)).toHaveLength(6);
  });
});

describe('the group table', () => {
  const grouped = FIELD_GROUPS.flatMap((group) => group.keys);
  const ownedByNamedStyle = new Set(STYLE_FIELDS.map((spec) => spec.key));
  const ownedByDefaults = new Set(INHERITED_STYLE_FIELDS.map((spec) => spec.key));

  it('places each key a style disclosure can list in exactly one group', () => {
    const namedStyle = styleKeys().filter((key) => !ownedByNamedStyle.has(key));
    expect(namedStyle).toHaveLength(16);
    expect([...grouped].sort()).toEqual([...namedStyle].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    const defaults = surfaceKeys({ kind: 'defaultsStyle' }).filter(
      (key) => !ownedByDefaults.has(key),
    );
    expect(defaults).toHaveLength(7);
    expect(defaults.filter((key) => !grouped.includes(key))).toEqual([]);
  });

  it('heads every group but the last', () => {
    const titles = FIELD_GROUPS.flatMap((group) => group.titleKey ?? []);
    expect(titles).toHaveLength(FIELD_GROUPS.length - 1);
    expect(FIELD_GROUPS.at(-1)?.titleKey).toBeUndefined();
    expect(titles.map((key) => t(key))).toEqual([
      'Spacing & lines',
      'Border',
      'Vertical position & overflow',
      'Vertical writing & line breaking',
    ]);
  });
});

describe('blocksOf / rowsOf', () => {
  const key = (item: string) => item;

  it('puts ungrouped keys first, groups in table order, and drops an empty group', () => {
    const blocks = blocksOf(['opacity', 'overflowText', 'lineBreak', 'letterSpacing'], key);
    expect(blocks).toEqual([
      { titleKey: undefined, ruled: false, items: ['overflowText'] },
      { titleKey: 'panel.schema.group.spacing', ruled: false, items: ['letterSpacing'] },
      { titleKey: 'panel.schema.group.vertical', ruled: false, items: ['lineBreak'] },
      { titleKey: undefined, ruled: true, items: ['opacity'] },
    ]);
  });

  it('orders a group by the table, and rules the headless group only after another', () => {
    expect(blocksOf(['textDecoration', 'letterSpacing'], key)[0].items).toEqual([
      'letterSpacing',
      'textDecoration',
    ]);
    expect(blocksOf(['opacity'], key)).toEqual([
      { titleKey: undefined, ruled: false, items: ['opacity'] },
    ]);
  });

  it('pairs two short items per row and gives anything else a row of its own', () => {
    const short = (item: string) => item.startsWith('s');
    expect(rowsOf(['s1', 's2', 's3', 'w1', 's4', 's5'], short)).toEqual([
      ['s1', 's2'],
      ['s3'],
      ['w1'],
      ['s4', 's5'],
    ]);
    expect(rowsOf(['w1', 's1'], short)).toEqual([['w1'], ['s1']]);
  });
});
