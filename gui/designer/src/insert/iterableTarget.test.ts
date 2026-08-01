// Tests for iterableTarget.ts — where an iterable scaffold lands: the
// resolved insert target for the current selection.
import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { resolveIterableTarget } from './iterableTarget';
import { BODY_ITEMS_PATH } from './model';

describe('resolveIterableTarget', () => {
  const SOURCE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: text',
    '        text: a',
    '      - type: container',
    '        items:',
    '          - type: text',
    '            text: inner',
    '',
  ].join('\n');

  function reader(source: string) {
    const editor = Editor.create(source);
    return (path: string) => editor.read(path);
  }

  it('inserts after the selection top-level body item, even from a nested selection', () => {
    expect(resolveIterableTarget(reader(SOURCE), 'sections.body.items[0]')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 1,
    });
    expect(resolveIterableTarget(reader(SOURCE), 'sections.body.items[1].items[0]')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 2,
    });
  });

  it('appends at the body end for a non-body selection and for no selection', () => {
    expect(resolveIterableTarget(reader(SOURCE), 'sections.header.items[0]')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 2,
    });
    expect(resolveIterableTarget(reader(SOURCE), null)).toEqual({
      path: BODY_ITEMS_PATH,
      index: 2,
    });
  });

  it('treats an unparseable selection and a hostile body read as an empty append', () => {
    expect(resolveIterableTarget(reader(SOURCE), 'not a path [')).toEqual({
      path: BODY_ITEMS_PATH,
      index: 2,
    });
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
    expect(resolveIterableTarget(reader(bomb), null)).toEqual({
      path: BODY_ITEMS_PATH,
      index: 0,
    });
  });
});
