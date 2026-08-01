import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { type GroupRow, groupCoverage, groupPathInfo, readGroupsView, spanOp } from './groupModel';

const SOURCE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: table',
  '        data: { key: rows }',
  '        headerGroups:',
  '          - { label: 品目, span: 2 }',
  '          - { label: 数量, span: 3 }',
  '          - span: 1',
  '          - 7',
  '        columns:',
  '          - { label: 品名, data: { key: name } }',
  '          - { label: 単位, data: { key: unit } }',
  '          - { label: ご注文, data: { key: ordered } }',
  '          - { label: 今回納品, data: { key: shipped } }',
  '          - { label: 残, data: { key: rest } }',
  '          - { label: 金額, data: { key: amount } }',
  '',
].join('\n');

const TABLE = 'sections.body.items[0]';

function rows(...spans: readonly (number | string)[]): GroupRow[] {
  return spans.map((span) => ({ label: '', span: String(span) }));
}

describe('readGroupsView', () => {
  it('reads label / span display per group, indices true through hostile entries', () => {
    const view = readGroupsView(Editor.create(SOURCE).read(TABLE));
    expect(view).toEqual([
      { label: '品目', span: '2' },
      { label: '数量', span: '3' },
      // An unset label and a non-map entry both keep their slot so the
      // indices still address the document.
      { label: '', span: '1' },
      { label: '', span: '' },
    ]);
  });

  it('is null when the node carries no headerGroups array, or is no map at all', () => {
    expect(readGroupsView({ headerGroups: 'nope' })).toBeNull();
    expect(readGroupsView({})).toBeNull();
    expect(readGroupsView('table')).toBeNull();
    expect(readGroupsView(null)).toBeNull();
    expect(readGroupsView([1, 2])).toBeNull();
  });

  it('drops a non-finite or non-number span to the empty display form', () => {
    expect(readGroupsView({ headerGroups: [{ span: Number.NaN }, { span: '2' }] })).toEqual([
      { label: '', span: '' },
      { label: '', span: '' },
    ]);
  });
});

describe('groupPathInfo', () => {
  it('recognizes a header-group path and returns the owning table + index', () => {
    expect(groupPathInfo(`${TABLE}.headerGroups[1]`)).toEqual({ tablePath: TABLE, index: 1 });
  });

  it('rejects a column path, other tails, and malformed paths', () => {
    expect(groupPathInfo(`${TABLE}.columns[1]`)).toBeNull();
    // The key must be the LAST one before the index, not merely present.
    expect(groupPathInfo(`${TABLE}.headerGroups[0].label`)).toBeNull();
    expect(groupPathInfo(`${TABLE}.headerGroups`)).toBeNull();
    expect(groupPathInfo('headerGroups[0]')).toBeNull();
    expect(groupPathInfo('')).toBeNull();
    expect(groupPathInfo('a..b[0]')).toBeNull();
  });
});

describe('groupCoverage', () => {
  it('accumulates left to right, mirroring the engine', () => {
    const groups = rows(2, 3, 1);
    expect(groupCoverage(groups, 6, 0)).toEqual({ start: 0, span: 2 });
    expect(groupCoverage(groups, 6, 1)).toEqual({ start: 2, span: 3 });
    expect(groupCoverage(groups, 6, 2)).toEqual({ start: 5, span: 1 });
  });

  it('floors a zero / unset / garbage span at one column, like the engine', () => {
    expect(groupCoverage(rows(0), 6, 0)).toEqual({ start: 0, span: 1 });
    expect(groupCoverage(rows(''), 6, 0)).toEqual({ start: 0, span: 1 });
    expect(groupCoverage(rows('1.5'), 6, 0)).toEqual({ start: 0, span: 1 });
  });

  it('clamps an over-running span to the columns left and drops what follows', () => {
    const groups = rows(9, 1);
    expect(groupCoverage(groups, 6, 0)).toEqual({ start: 0, span: 6 });
    expect(groupCoverage(groups, 6, 1)).toBeNull();
  });

  it('is null for an index past the list and for a table with no columns', () => {
    expect(groupCoverage(rows(2), 6, 5)).toBeNull();
    expect(groupCoverage(rows(2), 0, 0)).toBeNull();
  });

  it('treats a sparse hole like an unset span (one column), keeping later indices true', () => {
    const sparse: GroupRow[] = [];
    sparse[1] = { label: '', span: '2' };
    expect(groupCoverage(sparse, 6, 0)).toEqual({ start: 0, span: 1 });
    expect(groupCoverage(sparse, 6, 1)).toEqual({ start: 1, span: 2 });
  });
});

describe('spanOp', () => {
  const path = `${TABLE}.headerGroups[0]`;

  it('authors a NUMBER literal at the group own path', () => {
    expect(spanOp(path, 6, '3')).toEqual({
      op: 'setScalar',
      path,
      keys: ['span'],
      value: 3,
    });
  });

  it('refuses rather than clearing a required key or writing an unparseable one', () => {
    // Empty is checked before Number(), which would read '' as 0.
    expect(spanOp(path, 6, '')).toBeNull();
    expect(spanOp(path, 6, '   ')).toBeNull();
    expect(spanOp(path, 6, '0')).toBeNull();
    expect(spanOp(path, 6, '-1')).toBeNull();
    expect(spanOp(path, 6, '1.5')).toBeNull();
    expect(spanOp(path, 6, 'wide')).toBeNull();
    expect(spanOp(path, 6, '1e30')).toBeNull();
    // Past the column count the engine clamps anyway, so it is not offered.
    expect(spanOp(path, 6, '7')).toBeNull();
  });

  it('applied to a real document, touches ONLY the edited span line', () => {
    const editor = Editor.create(SOURCE);
    const op = spanOp(`${TABLE}.headerGroups[1]`, 6, '2');
    expect(op).not.toBeNull();
    expect(editor.apply(op as NonNullable<typeof op>)).toEqual({ ok: true });
    // Byte-level diff: sibling groups, columns, comments — everything else
    // stays exactly as authored (the produced-file review bar).
    const changed = editor
      .text()
      .split('\n')
      .filter((line, i) => line !== SOURCE.split('\n')[i]);
    expect(changed).toEqual(['          - { label: 数量, span: 2 }']);
    // One edit = one undo step: a single undo restores the authored bytes.
    expect(editor.undo()).toBe(true);
    expect(editor.text()).toBe(SOURCE);
  });
});
