// Tests for insertMenu.ts — the insert-menu row model: a capability-less
// row is ABSENT rather than broken, and the conditional groups' order.
import { describe, expect, it } from 'vitest';
import { BAND_LABEL_KEYS } from './bandCreate';
import { type InsertArming, insertMenuGroups } from './insertMenu';

/** Nothing armed. Each test turns on only what it is about, so a row that
 * appears for the wrong reason fails the test that owns it. */
const NONE: InsertArming = {
  iterable: false,
  image: false,
  field: false,
  cutLine: false,
  line: false,
  ellipse: false,
  checkbox: false,
};
const ALL: InsertArming = {
  iterable: true,
  image: true,
  field: true,
  cutLine: true,
  line: true,
  ellipse: true,
  checkbox: true,
};

/** The element group's rows, by what each one inserts. */
function elementKinds(armed: InsertArming): string[] {
  return insertMenuGroups(armed)[0].entries.map((entry) =>
    entry.kind === 'element' ? entry.insert : entry.kind,
  );
}

describe('the form marks', () => {
  it('offers both rows after the rule, leaving the rect→line pair intact', () => {
    // The marks queue BEHIND `line` rather than beside `rect`: that adjacency
    // is a measured decision (a reader hunting for a rule reaches for a rect
    // flattened to a hairline), so a later shape must not split it.
    expect(
      elementKinds({ ...NONE, line: true, ellipse: true, checkbox: true }).slice(0, 5),
    ).toEqual(['text', 'rect', 'line', 'ellipse', 'checkbox']);
  });

  it('drops the ellipse row when the engine has no `ellipse`', () => {
    expect(elementKinds({ ...ALL, ellipse: false })).not.toContain('ellipse');
    expect(elementKinds({ ...ALL, ellipse: false })).toContain('checkbox');
  });

  it('drops the checkbox row when the engine has no `checkbox`', () => {
    // Its arming is BOTH `checkbox` and `checkbox.auto_size`, because the
    // snippet authors no `box:` — against an engine that has the item but not
    // the auto-size default, an unsized mark is skipped with
    // `mark_missing_size` rather than drawn.
    expect(elementKinds({ ...ALL, checkbox: false })).not.toContain('checkbox');
    expect(elementKinds({ ...ALL, checkbox: false })).toContain('ellipse');
  });

  it('offers neither against an engine that knows no marks', () => {
    expect(elementKinds(NONE)).not.toContain('ellipse');
    expect(elementKinds(NONE)).not.toContain('checkbox');
  });

  it('labels each row with its own catalog key', () => {
    const rows = insertMenuGroups({ ...NONE, ellipse: true, checkbox: true })[0].entries;
    expect(rows).toContainEqual({ kind: 'element', insert: 'ellipse', labelKey: 'insert.ellipse' });
    expect(rows).toContainEqual({
      kind: 'element',
      insert: 'checkbox',
      labelKey: 'insert.checkbox',
    });
  });
});

describe('insertMenuGroups', () => {
  it('groups every element kind under the element entry class, with the always-present container and paste entries', () => {
    const groups = insertMenuGroups({ ...NONE, cutLine: true, line: true });
    // The band group is unconditional, so the emptiest menu still has two.
    expect(groups).toHaveLength(2);
    expect(
      groups[0].entries.map((entry) => (entry.kind === 'element' ? entry.insert : entry.kind)),
    ).toEqual(['text', 'rect', 'line', 'qrCode', 'pageNumber', 'cutLine', 'container', 'paste']);
    expect(groups[0].entries).toContainEqual({
      kind: 'container',
      labelKey: 'insert.container',
    });
    expect(groups[0].entries.at(-1)).toEqual({ kind: 'paste', labelKey: 'insert.paste' });
  });

  it('offers the plain rule beside the rectangle, which is what a reader flattens without it', () => {
    const groups = insertMenuGroups({ ...NONE, line: true });
    expect(groups[0].entries).toContainEqual({
      kind: 'element',
      insert: 'line',
      labelKey: 'insert.line',
    });
    // Directly after `rect`: the row is where the workaround happened.
    expect(elementKinds({ ...NONE, line: true }).slice(0, 3)).toEqual(['text', 'rect', 'line']);
  });

  it('drops the plain rule when the engine cannot take a Length line endpoint', () => {
    // The snippet spans `100%`; an older engine parse-REJECTS the string form
    // on `from`/`to`, so offering the row would break the document.
    expect(elementKinds(NONE)).not.toContain('line');
    // …and dropping it moves no other row's relative order.
    expect(elementKinds(NONE)).toEqual([
      'text',
      'rect',
      'qrCode',
      'pageNumber',
      'container',
      'paste',
    ]);
  });

  it('arms the two line rows independently', () => {
    // They gate on DIFFERENT capabilities (`line.style` vs `line.length`), so
    // an engine with one and not the other offers exactly one row.
    expect(elementKinds({ ...NONE, cutLine: true })).toContain('cutLine');
    expect(elementKinds({ ...NONE, cutLine: true })).not.toContain('line');
    expect(elementKinds({ ...NONE, line: true })).toContain('line');
    expect(elementKinds({ ...NONE, line: true })).not.toContain('cutLine');
  });

  it('drops the cut-line row when the engine cannot style a line', () => {
    // An older engine parse-REJECTS `line`'s `style:`, so offering the row
    // would hand the user a snippet that breaks their document.
    expect(elementKinds(NONE)).not.toContain('cutLine');
  });

  it('offers both bands unconditionally — no capability, host or schema gate', () => {
    // Every arming combination, including the emptiest one: `sections.header`
    // and `sections.footer` have been in the wire since 0.1.0.
    for (const armed of [NONE, ALL]) {
      const band = insertMenuGroups(armed).find((g) => g.labelKey === 'insert.group.band');
      expect(band?.entries).toEqual([
        { kind: 'band', band: 'header', labelKey: 'tree.section.header' },
        { kind: 'band', band: 'footer', labelKey: 'tree.section.footer' },
      ]);
    }
  });

  it('names the band rows with the SAME key the layer tree uses', () => {
    // One key per band across the three surfaces that name it (menu, tree,
    // panel heading), so they cannot drift into different words.
    const band = insertMenuGroups(NONE).find((g) => g.labelKey === 'insert.group.band');
    expect(
      band?.entries.map((entry) => (entry.kind === 'band' ? entry.labelKey : entry.kind)),
    ).toEqual([BAND_LABEL_KEYS.header, BAND_LABEL_KEYS.footer]);
  });

  it('adds the data-field group only when the field entry is armed', () => {
    const groups = insertMenuGroups({ ...NONE, field: true });
    expect(groups).toHaveLength(3);
    expect(groups[2].labelKey).toBe('insert.group.field');
    expect(groups[2].entries).toEqual([{ kind: 'field', labelKey: 'insert.field' }]);
  });

  it('adds the list-data group only when the iterable entry is armed', () => {
    const groups = insertMenuGroups({ ...NONE, iterable: true });
    expect(groups).toHaveLength(3);
    expect(groups[2].labelKey).toBe('insert.group.listData');
    expect(groups[2].entries).toEqual([{ kind: 'iterable', labelKey: 'insert.iterable' }]);
  });

  it('adds the image group only when the image entry is armed', () => {
    const groups = insertMenuGroups({ ...NONE, image: true });
    expect(groups).toHaveLength(3);
    expect(groups[2].labelKey).toBe('insert.group.image');
    expect(groups[2].entries).toEqual([{ kind: 'image', labelKey: 'insert.image' }]);
  });

  it('puts the bands under the elements, then the conditional groups in order', () => {
    const groups = insertMenuGroups(ALL);
    expect(groups.map((g) => g.labelKey)).toEqual([
      'insert.group.element',
      'insert.group.band',
      'insert.group.field',
      'insert.group.listData',
      'insert.group.image',
    ]);
  });
});
