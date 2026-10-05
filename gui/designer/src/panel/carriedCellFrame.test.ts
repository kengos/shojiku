// The frame a switch into free layout gives the new cell: the table's cell
// padding and the column's effective vertical alignment, so the carried item
// sits where the column's own content sat.

import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { carriedCellFrame } from './carriedCellFrame';

const COL = 'sections.body.items[0].columns[0]';

function frameFor(table: string, column = '- { label: A, data: { key: a } }'): unknown {
  const editor = Editor.create(`sections:
  body:
    type: flow
    items:
      - type: table
        data: { key: rows }
${table}        columns:
          ${column}
`);
  return carriedCellFrame((path) => editor.read(path), COL);
}

describe('carriedCellFrame', () => {
  it('carries the engine defaults: 4pt padding, centred', () => {
    expect(frameFor('')).toEqual({ padding: 4, justifyContent: 'center' });
  });

  it('carries the table’s own cell padding, number or length', () => {
    expect(frameFor('        cellPadding: 2\n')).toEqual({ padding: 2, justifyContent: 'center' });
    expect(frameFor('        cellPadding: 1.5mm\n')).toEqual({
      padding: '1.5mm',
      justifyContent: 'center',
    });
  });

  it('falls back to the default for a padding that is no length', () => {
    expect(frameFor('        cellPadding: -1\n')).toEqual({ padding: 4, justifyContent: 'center' });
    expect(frameFor("        cellPadding: ''\n")).toEqual({ padding: 4, justifyContent: 'center' });
    expect(frameFor('        cellPadding: { x: 1 }\n')).toEqual({
      padding: 4,
      justifyContent: 'center',
    });
  });

  it('maps the column’s own vertical alignment: top → start, bottom → end', () => {
    expect(frameFor('', '- { label: A, data: { key: a }, style: { verticalAlign: top } }')).toEqual(
      { padding: 4 },
    );
    expect(
      frameFor('', '- { label: A, data: { key: a }, style: { verticalAlign: bottom } }'),
    ).toEqual({ padding: 4, justifyContent: 'end' });
  });

  it('follows the body band and the table when the column sets nothing', () => {
    expect(frameFor('        row: { style: { verticalAlign: top } }\n')).toEqual({ padding: 4 });
    expect(frameFor('        style: { verticalAlign: bottom }\n')).toEqual({
      padding: 4,
      justifyContent: 'end',
    });
  });

  it('a path that is no column still gets the default frame', () => {
    const editor = Editor.create('sections:\n  body:\n    type: flow\n    items: []\n');
    expect(carriedCellFrame((path) => editor.read(path), 'sections.body.items[0]')).toEqual({
      padding: 4,
      justifyContent: 'center',
    });
  });
});
