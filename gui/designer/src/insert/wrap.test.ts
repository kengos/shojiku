import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { isWrappablePath, wrapInContainerOps } from './wrap';

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
  '            text: inner',
  '      - type: table',
  '        data: { key: rows }',
  '        columns:',
  '          - id: name',
  '            label: 品目',
  '            data: { key: name }',
  '',
].join('\n');

describe('isWrappablePath', () => {
  it('accepts an items-list entry (flow body, container child)', () => {
    expect(isWrappablePath('sections.body.items[0]')).toBe(true);
    expect(isWrappablePath('sections.body.items[1].items[0]')).toBe(true);
  });

  it('rejects a section root and a table column (not an items list)', () => {
    expect(isWrappablePath('sections.body')).toBe(false);
    expect(isWrappablePath('sections.body.items[2].columns[0]')).toBe(false);
    expect(isWrappablePath('sections.body.items[2].headerGroups[0]')).toBe(false);
  });
});

describe('wrapInContainerOps', () => {
  it('wraps a leaf item in a column container in place (one batch, node preserved)', () => {
    const editor = Editor.create(SOURCE);
    const ops = wrapInContainerOps((p) => editor.read(p), 'sections.body.items[0]');
    expect(ops).not.toBeNull();
    expect(editor.applyAll(ops as NonNullable<typeof ops>).ok).toBe(true);
    // The container now occupies the old index, holding the original node.
    expect(editor.read('sections.body.items[0]')).toEqual({
      type: 'container',
      box: { direction: 'column' },
      items: [{ type: 'text', text: 'hello' }],
    });
    // The other body items are untouched (shifted by nothing — wrap is in place).
    expect((editor.read('sections.body.items[1]') as { type: string }).type).toBe('container');
  });

  it('wraps a container itself (nesting)', () => {
    const editor = Editor.create(SOURCE);
    const ops = wrapInContainerOps((p) => editor.read(p), 'sections.body.items[1]');
    expect(editor.applyAll(ops as NonNullable<typeof ops>).ok).toBe(true);
    const wrapped = editor.read('sections.body.items[1]') as { type: string; items: unknown[] };
    expect(wrapped.type).toBe('container');
    expect((wrapped.items[0] as { type: string; items: unknown[] }).type).toBe('container');
    expect((wrapped.items[0] as { items: { text: string }[] }).items[0].text).toBe('inner');
  });

  it('returns null for a non-items sequence (a table column)', () => {
    const editor = Editor.create(SOURCE);
    expect(
      wrapInContainerOps((p) => editor.read(p), 'sections.body.items[2].columns[0]'),
    ).toBeNull();
  });

  it('returns null for a section root (not a sequence entry)', () => {
    const editor = Editor.create(SOURCE);
    expect(wrapInContainerOps((p) => editor.read(p), 'sections.body')).toBeNull();
  });

  it('returns null when the read throws (a hostile subtree)', () => {
    const throwing = () => {
      throw new Error('alias bomb');
    };
    expect(wrapInContainerOps(throwing, 'sections.body.items[0]')).toBeNull();
  });

  it('an OVERSIZED subtree builds ops the op layer rejects — the batch rolls back whole', () => {
    // wrapInContainerOps itself does not size-check: the re-authored node
    // rides insertItem's snippet validator (node cap 256), so a giant subtree
    // must fail the batch atomically, leaving the document byte-identical.
    const children = Array.from(
      { length: 300 },
      () => '          - type: text\n            text: x',
    );
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: container',
      '        items:',
      ...children,
      '',
    ].join('\n');
    const editor = Editor.create(source);
    const before = editor.text();
    const ops = wrapInContainerOps((p) => editor.read(p), 'sections.body.items[0]');
    expect(ops).not.toBeNull();
    expect(editor.applyAll(ops as NonNullable<typeof ops>).ok).toBe(false);
    expect(editor.text()).toBe(before);
  });

  it('returns null when the node is not a map', () => {
    const notMap = () => 42;
    expect(wrapInContainerOps(notMap, 'sections.body.items[0]')).toBeNull();
  });
});
