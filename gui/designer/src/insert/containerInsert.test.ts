import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { resolveContainerInsert } from './containerInsert';
import { resolveInsertTarget } from './model';

const DEFAULT = 'テキスト';

const SOURCE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: hello',
  '      - type: container',
  '        box: { direction: column }',
  '        items:',
  '          - type: text',
  '            text: テキスト',
  '          - type: text',
  '            text: 請求書',
  '      - type: table',
  '        data: { key: rows }',
  '        columns:',
  '          - id: name',
  '            label: 品目',
  '            data: { key: name }',
  '',
].join('\n');

function reader() {
  const editor = Editor.create(SOURCE);
  return (path: string) => editor.read(path);
}

describe('resolveContainerInsert', () => {
  it('nests into a placeholder slot directly inside a container', () => {
    const dest = resolveContainerInsert(reader(), 'sections.body.items[1].items[0]', DEFAULT);
    expect(dest).toEqual({ mode: 'nest', path: 'sections.body.items[1].items', index: 0 });
  });

  it('appends (never replaces) when the slot carries content', () => {
    const dest = resolveContainerInsert(reader(), 'sections.body.items[1].items[1]', DEFAULT);
    expect(dest.mode).toBe('append');
  });

  it('appends when the selection is not a container child (a flow-body item)', () => {
    const read = reader();
    const dest = resolveContainerInsert(read, 'sections.body.items[0]', DEFAULT);
    expect(dest).toEqual({
      mode: 'append',
      target: resolveInsertTarget(read, 'sections.body.items[0]'),
    });
  });

  it('appends when the parent sequence is not an items list (a table column)', () => {
    const dest = resolveContainerInsert(reader(), 'sections.body.items[2].columns[0]', DEFAULT);
    expect(dest.mode).toBe('append');
  });

  it('appends to the body when nothing is selected', () => {
    const read = reader();
    const dest = resolveContainerInsert(read, null, DEFAULT);
    expect(dest).toEqual({ mode: 'append', target: resolveInsertTarget(read, null) });
  });

  it('appends when the selection is not a sequence entry (a section root)', () => {
    const dest = resolveContainerInsert(reader(), 'sections.body', DEFAULT);
    expect(dest.mode).toBe('append');
  });

  it('appends when the read throws (a hostile subtree)', () => {
    const throwing = (): unknown => {
      throw new Error('alias bomb');
    };
    const dest = resolveContainerInsert(throwing, 'sections.body.items[1].items[0]', DEFAULT);
    expect(dest.mode).toBe('append');
  });

  it('appends when the slot owner is not a map (a hostile shape)', () => {
    const scalarOwner = (path: string): unknown => (path === 'a' ? 42 : undefined);
    const dest = resolveContainerInsert(scalarOwner, 'a.items[0]', DEFAULT);
    expect(dest.mode).toBe('append');
  });
});
