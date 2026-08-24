// Tests for insertMenu.ts — the insert-menu row model: a capability-less
// row is ABSENT rather than broken, and the conditional groups' order.
import { describe, expect, it } from 'vitest';
import { BAND_LABEL_KEYS } from './bandCreate';
import { insertMenuGroups } from './insertMenu';

describe('insertMenuGroups', () => {
  it('groups every element kind under the element entry class, with the always-present container and paste entries', () => {
    const groups = insertMenuGroups(false, false, false, true);
    // The band group is unconditional, so the emptiest menu still has two.
    expect(groups).toHaveLength(2);
    expect(
      groups[0].entries.map((entry) => (entry.kind === 'element' ? entry.insert : entry.kind)),
    ).toEqual(['text', 'rect', 'qrCode', 'pageNumber', 'cutLine', 'container', 'paste']);
    expect(groups[0].entries).toContainEqual({
      kind: 'container',
      labelKey: 'insert.container',
    });
    expect(groups[0].entries.at(-1)).toEqual({ kind: 'paste', labelKey: 'insert.paste' });
  });

  it('drops the cut-line row when the engine cannot style a line', () => {
    // An older engine parse-REJECTS `line`'s `style:`, so offering the row
    // would hand the user a snippet that breaks their document.
    const groups = insertMenuGroups(false, false, false, false);
    const kinds = groups[0].entries.map((entry) =>
      entry.kind === 'element' ? entry.insert : entry.kind,
    );
    expect(kinds).not.toContain('cutLine');
  });

  it('offers both bands unconditionally — no capability, host or schema gate', () => {
    // Every arming combination, including the emptiest one: `sections.header`
    // and `sections.footer` have been in the wire since 0.1.0.
    for (const armed of [false, true]) {
      const groups = insertMenuGroups(armed, armed, armed, armed);
      const band = groups.find((g) => g.labelKey === 'insert.group.band');
      expect(band?.entries).toEqual([
        { kind: 'band', band: 'header', labelKey: 'tree.section.header' },
        { kind: 'band', band: 'footer', labelKey: 'tree.section.footer' },
      ]);
    }
  });

  it('names the band rows with the SAME key the layer tree uses', () => {
    // One key per band across the three surfaces that name it (menu, tree,
    // panel heading), so they cannot drift into different words.
    const band = insertMenuGroups(false, false, false, false).find(
      (g) => g.labelKey === 'insert.group.band',
    );
    expect(
      band?.entries.map((entry) => (entry.kind === 'band' ? entry.labelKey : entry.kind)),
    ).toEqual([BAND_LABEL_KEYS.header, BAND_LABEL_KEYS.footer]);
  });

  it('adds the data-field group only when the field entry is armed', () => {
    const groups = insertMenuGroups(false, false, true, true);
    expect(groups).toHaveLength(3);
    expect(groups[2].labelKey).toBe('insert.group.field');
    expect(groups[2].entries).toEqual([{ kind: 'field', labelKey: 'insert.field' }]);
  });

  it('adds the list-data group only when the iterable entry is armed', () => {
    const groups = insertMenuGroups(true, false, false, true);
    expect(groups).toHaveLength(3);
    expect(groups[2].labelKey).toBe('insert.group.listData');
    expect(groups[2].entries).toEqual([{ kind: 'iterable', labelKey: 'insert.iterable' }]);
  });

  it('adds the image group only when the image entry is armed', () => {
    const groups = insertMenuGroups(false, true, false, true);
    expect(groups).toHaveLength(3);
    expect(groups[2].labelKey).toBe('insert.group.image');
    expect(groups[2].entries).toEqual([{ kind: 'image', labelKey: 'insert.image' }]);
  });

  it('puts the bands under the elements, then the conditional groups in order', () => {
    const groups = insertMenuGroups(true, true, true, true);
    expect(groups.map((g) => g.labelKey)).toEqual([
      'insert.group.element',
      'insert.group.band',
      'insert.group.field',
      'insert.group.listData',
      'insert.group.image',
    ]);
  });
});
