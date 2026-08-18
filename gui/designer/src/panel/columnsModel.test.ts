import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  addColumnOp,
  columnPathInfo,
  moveColumnOp,
  readColumnsView,
  readSelectionView,
  removeColumnOp,
} from './columnsModel';

const SOURCE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: table',
  '        data: { key: rows }',
  '        columns:',
  '          - label: 品名',
  '            data: { key: name }',
  '          - label: 金額',
  '            data: { key: amount, format: symbol }',
  '            width: 15%',
  '          - label: 幅数値',
  '            data: { key: n }',
  '            width: 90',
  '          - label: 明細',
  '            cell:',
  '              items:',
  '                - type: text',
  '                  text: x',
  '          - 3',
  '',
].join('\n');

function editor() {
  return Editor.create(SOURCE);
}

const TABLE = 'sections.body.items[0]';

describe('readColumnsView', () => {
  it('reads label / key / width / format display / cell flag per column, indices true', () => {
    expect(readColumnsView(editor().read(TABLE))).toEqual([
      {
        label: '品名',
        key: 'name',
        width: '',
        format: '',
        scope: '',
        hasCell: false,
        textAlign: '',
      },
      {
        label: '金額',
        key: 'amount',
        width: '15%',
        format: 'symbol',
        scope: '',
        hasCell: false,
        textAlign: '',
      },
      {
        label: '幅数値',
        key: 'n',
        width: '90',
        format: '',
        scope: '',
        hasCell: false,
        textAlign: '',
      },
      { label: '明細', key: '', width: '', format: '', scope: '', hasCell: true, textAlign: '' },
      // A hostile non-map entry still yields a row so indices stay true.
      { label: '', key: '', width: '', format: '', scope: '', hasCell: false, textAlign: '' },
    ]);
  });

  it('drops a non-string / hostile format to the empty display form', () => {
    // A numeric format, and a `__proto__`-shaped column, both read as ''
    // (the `data` read is `record()`-guarded — no prototype walk).
    expect(readColumnsView({ columns: [{ data: { key: 'a', format: 5 } }] })?.[0].format).toBe('');
    expect(
      readColumnsView({ columns: [{ data: { key: 'a', format: { evil: true } } }] })?.[0].format,
    ).toBe('');
  });

  it('is null when the node has no columns array (or is no map at all)', () => {
    expect(readColumnsView({ type: 'text' })).toBeNull();
    expect(readColumnsView({ type: 'table', columns: 'nope' })).toBeNull();
    expect(readColumnsView(undefined)).toBeNull();
    expect(readColumnsView([1, 2])).toBeNull();
  });

  it('drops a non-finite width to the empty display form', () => {
    expect(readColumnsView({ columns: [{ width: Number.NaN }] })).toEqual([
      { label: '', key: '', width: '', format: '', scope: '', hasCell: false, textAlign: '' },
    ]);
  });
});

describe('columnPathInfo', () => {
  it('recognizes a column path and returns the owning table + index', () => {
    expect(columnPathInfo(`${TABLE}.columns[2]`)).toEqual({ tablePath: TABLE, index: 2 });
  });

  it('rejects non-column paths and malformed paths', () => {
    expect(columnPathInfo(TABLE)).toBeNull();
    expect(columnPathInfo(`${TABLE}.columns`)).toBeNull();
    expect(columnPathInfo(`${TABLE}.columns[0].cell`)).toBeNull();
    expect(columnPathInfo('columns[1]')).toBeNull();
    expect(columnPathInfo('not a path [')).toBeNull();
  });
});

describe('column ops', () => {
  it('adds a label-only column at the end (one op)', () => {
    const session = editor();
    const result = session.apply(addColumnOp(TABLE, 5, '新しい列'));
    expect(result.ok).toBe(true);
    const rows = readColumnsView(session.read(TABLE));
    expect(rows?.[5]).toEqual({
      label: '新しい列',
      key: '',
      width: '',
      format: '',
      scope: '',
      hasCell: false,
      textAlign: '',
    });
  });

  it('removes a column (one op)', () => {
    const session = editor();
    expect(session.apply(removeColumnOp(TABLE, 1)).ok).toBe(true);
    const rows = readColumnsView(session.read(TABLE));
    expect(rows?.map((row) => row.label)).toEqual(['品名', '幅数値', '明細', '']);
  });

  it('moves a column one slot in either direction (one op each)', () => {
    const session = editor();
    expect(session.apply(moveColumnOp(TABLE, 1, 0)).ok).toBe(true);
    expect(readColumnsView(session.read(TABLE))?.map((row) => row.label)).toEqual([
      '金額',
      '品名',
      '幅数値',
      '明細',
      '',
    ]);
    expect(session.apply(moveColumnOp(TABLE, 0, 1)).ok).toBe(true);
    expect(readColumnsView(session.read(TABLE))?.map((row) => row.label)).toEqual([
      '品名',
      '金額',
      '幅数値',
      '明細',
      '',
    ]);
  });
});

describe('readColumnsView — column binding scope', () => {
  it('reports an authored document scope, an unset one, and a hostile one', () => {
    const rows = readColumnsView({
      columns: [
        { label: 'a', data: { key: 'store.name', scope: 'document' } },
        { label: 'b', data: { key: 'name' } },
        { label: 'c', data: { key: 'x', scope: 7 } },
        { label: 'd' },
      ],
    });
    expect(rows?.map((row) => row.scope)).toEqual(['document', '', '', '']);
  });
});

describe('readColumnsView — the column’s own alignment', () => {
  it('reads an authored textAlign off the column style', () => {
    const rows = readColumnsView({ columns: [{ style: { textAlign: 'right' } }] });
    expect(rows?.[0].textAlign).toBe('right');
  });

  it('reads it as unset when the style is absent, not a map, or not a string', () => {
    for (const column of [
      {},
      { style: 'right' },
      { style: ['right'] },
      { style: { textAlign: 3 } },
    ]) {
      expect(readColumnsView({ columns: [column] })?.[0].textAlign).toBe('');
    }
  });
});

describe('readSelectionView', () => {
  const COLUMN = `${TABLE}.columns[0]`;

  it('formats a column that omits the optional `type` key, like the text it defaults to', () => {
    // The defect this closes: `readItemView` requires a string `type`, so the
    // toolbar appeared for a column that spelled `type: text` out and vanished
    // for one that relied on the default — the same column either way.
    const view = readSelectionView({ label: '金額', data: { key: 'amount' } }, COLUMN);
    expect(view?.type).toBe('text');
  });

  it('keeps a column’s AUTHORED type, so an image column still reads as an image', () => {
    const view = readSelectionView({ type: 'image', data: { key: 'logo' } }, COLUMN);
    expect(view?.type).toBe('image');
  });

  it('leaves a non-column path to the ordinary item read', () => {
    expect(readSelectionView({ type: 'text' }, TABLE)?.type).toBe('text');
    expect(readSelectionView({ label: 'no type here' }, TABLE)).toBeNull();
  });

  it('formats nothing for a column entry that is not a map', () => {
    // The op layer would refuse a write into a scalar, and an offered control
    // that does nothing is worse than an absent one.
    for (const hostile of ['a string', 7, ['a', 'b'], null]) {
      expect(readSelectionView(hostile, COLUMN)).toBeNull();
    }
  });

  it('treats a `__proto__` key in the document as inert data', () => {
    const hostile = JSON.parse('{"label":"x","__proto__":{"polluted":true}}');
    expect(readSelectionView(hostile, COLUMN)?.type).toBe('text');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
