import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { BODY_ITEMS_PATH, hasNoBodyItems, resolveInsertTarget } from './model';

const SOURCE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: hello',
  '      - type: container',
  '        items:',
  '          - type: text',
  '            text: inner',
  '      - type: table',
  '        data: { key: rows }',
  '        columns:',
  '          - id: name',
  '            label: 品目',
  '            data: { key: name }',
  '',
].join('\n');

function reader(source: string) {
  const editor = Editor.create(source);
  return (path: string) => editor.read(path);
}

describe('resolveInsertTarget', () => {
  it('appends to the body when nothing is selected', () => {
    expect(resolveInsertTarget(reader(SOURCE), null)).toEqual({
      path: BODY_ITEMS_PATH,
      index: 3,
    });
  });

  it('inserts right after a selected leaf item', () => {
    expect(resolveInsertTarget(reader(SOURCE), 'sections.body.items[0]')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 1,
    });
  });

  it('inserts INTO a selected container (append at its end)', () => {
    expect(resolveInsertTarget(reader(SOURCE), 'sections.body.items[1]')).toEqual({
      path: 'sections.body.items[1].items',
      index: 1,
    });
  });

  it('inserts after a nested item inside a container', () => {
    expect(resolveInsertTarget(reader(SOURCE), 'sections.body.items[1].items[0]')).toEqual({
      path: 'sections.body.items[1].items',
      index: 1,
    });
  });

  it('walks up from a scalar-valued selection to its enclosing item', () => {
    expect(resolveInsertTarget(reader(SOURCE), 'sections.body.items[0].text')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 1,
    });
  });

  it('inserts after the table itself, never into its columns', () => {
    expect(resolveInsertTarget(reader(SOURCE), 'sections.body.items[2]')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 3,
    });
  });

  it('walks a column selection up to the nearest items sequence', () => {
    expect(resolveInsertTarget(reader(SOURCE), 'sections.body.items[2].columns[0]')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 3,
    });
  });

  it('falls back to an empty-body append when the selection resolves nowhere', () => {
    // A selection whose path has no enclosing `items` sequence (a band path on
    // a document without one) falls through to the body default.
    const read = reader(['sections:', '  body:', '    type: flow', ''].join('\n'));
    expect(resolveInsertTarget(read, 'sections')).toEqual({ path: BODY_ITEMS_PATH, index: 0 });
  });

  it('treats a body items key holding a MAP as length 0 (op layer rejects later)', () => {
    const read = reader(
      ['sections:', '  body:', '    items:', '      broken: true', ''].join('\n'),
    );
    expect(resolveInsertTarget(read, null)).toEqual({ path: BODY_ITEMS_PATH, index: 0 });
  });

  it('reads a hostile alias-bomb subtree as an empty target instead of throwing', () => {
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]',
      'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
      'd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]',
      'sections:',
      '  body:',
      '    items: *d',
      '',
    ].join('\n');
    expect(resolveInsertTarget(reader(bomb), null)).toEqual({ path: BODY_ITEMS_PATH, index: 0 });
    // The selection arm takes the same guarded read.
    expect(resolveInsertTarget(reader(bomb), 'sections.body')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 0,
    });
  });
});

describe('hasNoBodyItems', () => {
  it('is true for an empty item list and a missing items key', () => {
    expect(hasNoBodyItems(reader(['sections:', '  body:', '    items: []', ''].join('\n')))).toBe(
      true,
    );
    expect(hasNoBodyItems(reader(['sections:', '  body:', '    type: flow', ''].join('\n')))).toBe(
      true,
    );
  });

  it('is false for a populated body', () => {
    expect(hasNoBodyItems(reader(SOURCE))).toBe(false);
  });

  it('is false when items holds a non-list value', () => {
    const read = reader(['sections:', '  body:', '    items: 3', ''].join('\n'));
    expect(hasNoBodyItems(read)).toBe(false);
  });

  it('is false when the read throws on a hostile subtree', () => {
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]',
      'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
      'd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]',
      'sections:',
      '  body:',
      '    items: *d',
      '',
    ].join('\n');
    expect(hasNoBodyItems(reader(bomb))).toBe(false);
  });
});
