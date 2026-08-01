// Tests for insertMenu.ts — the insert-menu row model: a capability-less
// row is ABSENT rather than broken, and the conditional groups' order.
import { describe, expect, it } from 'vitest';
import { insertMenuGroups } from './insertMenu';

describe('insertMenuGroups', () => {
  it('groups every element kind under the element entry class, with the always-present container and paste entries', () => {
    const groups = insertMenuGroups(false, false, false, true);
    expect(groups).toHaveLength(1);
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

  it('adds the data-field group only when the field entry is armed', () => {
    const groups = insertMenuGroups(false, false, true, true);
    expect(groups).toHaveLength(2);
    expect(groups[1].labelKey).toBe('insert.group.field');
    expect(groups[1].entries).toEqual([{ kind: 'field', labelKey: 'insert.field' }]);
  });

  it('adds the list-data group only when the iterable entry is armed', () => {
    const groups = insertMenuGroups(true, false, false, true);
    expect(groups).toHaveLength(2);
    expect(groups[1].labelKey).toBe('insert.group.listData');
    expect(groups[1].entries).toEqual([{ kind: 'iterable', labelKey: 'insert.iterable' }]);
  });

  it('adds the image group only when the image entry is armed', () => {
    const groups = insertMenuGroups(false, true, false, true);
    expect(groups).toHaveLength(2);
    expect(groups[1].labelKey).toBe('insert.group.image');
    expect(groups[1].entries).toEqual([{ kind: 'image', labelKey: 'insert.image' }]);
  });

  it('appends the conditional groups in field / list-data / image order when armed together', () => {
    const groups = insertMenuGroups(true, true, true, true);
    expect(groups.map((g) => g.labelKey)).toEqual([
      'insert.group.element',
      'insert.group.field',
      'insert.group.listData',
      'insert.group.image',
    ]);
  });
});
