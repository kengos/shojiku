// What each hand-made surface's catalog section lists, against the committed
// catalog: the partition gate (every key the catalog gives a surface has
// exactly one control there — a row of its own, or the disclosure), with the
// sizes pinned so a catalog change reds here visibly; and the capability
// filter (a gated key goes with its capability, an ungated host keeps all).

import { type CatalogSurface, surfaceKeys } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { defaultsStyleOwnedKeys } from '../DefaultsStyleFields';
import { listSourceOwnedKeys } from '../IterableSourceSection';
import { styleFormOwnedKeys } from '../StyleFormFields';
import { capableFields, listedFields } from './listedFields';

const SURFACES: readonly {
  readonly name: string;
  readonly surface: CatalogSurface;
  readonly owned: readonly string[];
  readonly listed: number;
}[] = [
  {
    name: 'the named-style form',
    surface: { kind: 'style' },
    owned: styleFormOwnedKeys(),
    listed: 16,
  },
  {
    name: 'the defaults.style section',
    surface: { kind: 'defaultsStyle' },
    owned: defaultsStyleOwnedKeys(),
    listed: 7,
  },
  {
    name: 'the list content tab',
    surface: { kind: 'item', type: 'list' },
    owned: listSourceOwnedKeys(),
    listed: 2,
  },
];

describe.each(SURFACES)('$name', ({ surface, owned, listed }) => {
  const keys = listedFields(surface, owned).map((field) => field.key);

  it('lists every catalog key its own rows do not edit, and no other', () => {
    expect(keys.filter((key) => owned.includes(key))).toEqual([]);
    expect([...owned, ...keys].sort()).toEqual([...surfaceKeys(surface)].sort());
    expect(new Set(owned).size).toBe(owned.length);
    expect(keys).toHaveLength(listed);
  });
});

describe('the lists themselves', () => {
  it('are the keys the mock lists', () => {
    expect(
      listedFields({ kind: 'defaultsStyle' }, defaultsStyleOwnedKeys()).map((f) => f.key),
    ).toEqual([
      'lineBreak',
      'textSpacingTrim',
      'hangingPunctuation',
      'letterSpacing',
      'writingMode',
      'textOrientation',
      'textCombineUpright',
    ]);
    expect(
      listedFields({ kind: 'item', type: 'list' }, listSourceOwnedKeys()).map((f) => f.key),
    ).toEqual(['bindings', 'overflowText']);
  });
});

describe('capableFields', () => {
  const fields = listedFields({ kind: 'style' }, styleFormOwnedKeys());

  it('keeps every field for a host that gates nothing', () => {
    expect(capableFields(fields, undefined)).toEqual(fields);
  });

  it('drops a field whose capability the host lacks, keeps one it reports', () => {
    const kept = capableFields(fields, ['style.lineBreak', 'style.border']);
    expect(kept.map((field) => field.key).sort()).toEqual([
      'borderColor',
      'borderWidth',
      'lineBreak',
    ]);
  });

  it('keeps a field the catalog does not gate', () => {
    const ungated = listedFields({ kind: 'style' }, []).filter((f) => f.capability === undefined);
    expect(ungated.map((field) => field.key).sort()).toEqual([
      'color',
      'fontFamily',
      'fontSize',
      'lineHeight',
      'textAlign',
    ]);
    expect(capableFields(ungated, [])).toEqual(ungated);
  });
});
