import { Editor } from '@shojiku/designer-core';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import type { ItemPanelProps } from './itemPanelProps';
import { readItemView } from './itemView';
import { chipsFor, documentScopeCreateField, scopePickerProps } from './panelHelpers';

/** A body text item plus a table whose cell holds a row-bound text item — the
 * two scope situations the helpers branch on: a document-scope selection and a
 * selection INSIDE an array sub-template. */
const SOURCE = [
  'version: 1',
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: text',
  '        text: plain',
  '      - type: table',
  '        data: { key: rows }',
  '        columns:',
  '          - label: Name',
  '            cell:',
  '              items:',
  '                - type: text',
  '                  data: { key: name }',
  '',
].join('\n');

const BODY = 'sections.body.items[0]';
const CELL = 'sections.body.items[1].columns[0].cell.items[0]';

/** Real props over a real `designer-core` session — these helpers read the
 * document through the controller, so a stubbed read would prove nothing. */
function propsAt(path: string, over: Partial<ItemPanelProps> = {}): ItemPanelProps {
  const session = Editor.create(SOURCE);
  const read = (p: string) => session.read(p);
  const view = readItemView(read(path));
  if (view === null) {
    throw new Error('fixture path must resolve to an item');
  }
  const controller = {
    read,
    applyAll: vi.fn((ops: readonly unknown[]) => session.applyAll(ops as never)),
  } as unknown as EditorController;
  return {
    controller,
    path,
    view,
    fontFamilies: [],
    paletteGroups: null,
    params: '{}',
    gridStep: 0,
    ...over,
  } as ItemPanelProps;
}

describe('chipsFor', () => {
  it('reports NO array scope for a document-scope selection', () => {
    expect(chipsFor(propsAt(BODY)).scope).toBeNull();
  });

  it('reports the array scope for a selection inside a table cell', () => {
    expect(chipsFor(propsAt(CELL)).scope).not.toBeNull();
  });
});

describe('documentScopeCreateField', () => {
  it('offers create-field at document scope (the field would be reachable)', () => {
    const onCreateField = vi.fn();
    expect(documentScopeCreateField(propsAt(BODY, { onCreateField }))).toBe(onCreateField);
  });

  it('withholds it INSIDE an array scope, where a document field would not bind', () => {
    const onCreateField = vi.fn();
    expect(documentScopeCreateField(propsAt(CELL, { onCreateField }))).toBeUndefined();
  });

  it('stays undefined when the host injected no create-field flow at all', () => {
    expect(documentScopeCreateField(propsAt(BODY))).toBeUndefined();
  });
});

describe('scopePickerProps', () => {
  it('offers no scope picker at all when the selection has no array scope', () => {
    const props = propsAt(BODY);
    expect(scopePickerProps(props, chipsFor(props))).toEqual({});
  });

  it('offers the document-scope rows when the engine can author a scope', () => {
    const props = propsAt(CELL);
    const out = scopePickerProps(props, chipsFor(props));
    expect(out.documentOptions).toBeDefined();
    expect(out.onPick).toBeDefined();
  });

  it('withholds the document rows against an engine lacking the scope key', () => {
    // Capability-gated: a newer GUI against an older engine must not offer a
    // pick the engine cannot carry. The picker itself still renders.
    const props = propsAt(CELL, { capabilities: ['style.border'] });
    const out = scopePickerProps(props, chipsFor(props));
    expect(out.documentOptions).toBeUndefined();
    expect(out.onPick).toBeDefined();
  });

  it('commits a pick as ONE transactional batch (one undo step)', () => {
    const props = propsAt(CELL);
    scopePickerProps(props, chipsFor(props)).onPick?.('order.code', true);
    expect(props.controller.applyAll).toHaveBeenCalledTimes(1);
  });
});
