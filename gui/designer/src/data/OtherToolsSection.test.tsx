// 「ほかのツール向けの情報」 driven through the whole data-item editor over a
// LIVE definitions harness: a field's alignment and bold merged into the bag
// (other keys kept and named), an authored value outside the controls kept, an
// unreadable bag reported, a table's row name, and where the section does not
// appear.

import type { Op } from '@shojiku/designer-core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { DataEditorView } from './DataEditorView';
import { applyDefinitionOps } from './definitionsEdit';

const DEFS = `type: object
properties:
  total: { type: number, title: 合計, recommendedStyle: { color: red, fontWeight: 600 } }
  memo: { type: string, title: メモ }
  odd: { type: string, title: 変, recommendedStyle: right }
  just: { type: string, title: 両端, recommendedStyle: { textAlign: justify } }
  lines:
    type: array
    title: 明細
    items:
      type: object
      title: 明細行
      properties:
        sku: { type: string, title: 品番 }
  info: { type: object, title: 情報, properties: {} }
  tags: { type: array, title: タグ, items: { type: string } }
`;

function Harness({ ops, editable }: { readonly ops: Op[]; readonly editable: boolean }) {
  const [text, setText] = useState(DEFS);
  return (
    <I18nProvider locale="ja">
      <DataEditorView
        definitions={text}
        params="{}"
        templateText=""
        onDefinitionEdit={
          editable
            ? (op) => {
                ops.push(op);
                setText((current) => applyDefinitionOps(current, [op]));
                return true;
              }
            : undefined
        }
        onParamsChange={vi.fn()}
        onClose={vi.fn()}
      />
    </I18nProvider>
  );
}

function draw(editable = true) {
  const ops: Op[] = [];
  render(<Harness ops={ops} editable={editable} />);
  return ops;
}

function select(label: string) {
  const row = within(screen.getByRole('navigation'))
    .getAllByRole('button')
    .find((button) => (button.textContent ?? '').startsWith(label));
  if (row === undefined) {
    throw new Error(`no row ${label}`);
  }
  fireEvent.click(row);
}

const section = () =>
  within(
    screen
      .getByRole('heading', { level: 3, name: 'ほかのツール向けの情報' })
      .closest('section') as HTMLElement,
  );
const align = (name: string) => section().getByRole('radio', { name });
const STYLE = ['properties', 'total', 'recommendedStyle'];

describe('a field’s hints for other tools', () => {
  it('says it changes nothing here, and merges an alignment into the bag', () => {
    const ops = draw();
    select('合計');
    expect(
      section().getByText(
        'AI やほかの作成ツールが読むヒントです。この Designer の表示・配置にも、印刷結果にも影響しません。',
      ),
    ).toBeTruthy();
    expect(align('指定なし')).toHaveProperty('checked', true);
    fireEvent.click(align('右'));
    expect(ops).toEqual([{ op: 'setScalar', keys: [...STYLE, 'textAlign'], value: 'right' }]);
    expect(align('右')).toHaveProperty('checked', true);
    fireEvent.click(align('右'));
    expect(ops).toHaveLength(1);
    fireEvent.click(align('指定なし'));
    expect(ops.at(-1)).toEqual({ op: 'removeKey', keys: [...STYLE, 'textAlign'] });
  });

  it('names the other keys it keeps, and shows another weight until bold replaces it', () => {
    const ops = draw();
    select('合計');
    expect(section().getByText('このほかの指定（color）は、そのまま残します。')).toBeTruthy();
    expect(
      section().getByText(
        'いまの文字の太さ: 600（定義ファイルに直接書かれた値です。「太字をおすすめ」にすると置き換わります）',
      ),
    ).toBeTruthy();
    const bold = section().getByRole('checkbox', { name: '太字をおすすめ' });
    expect(bold).toHaveProperty('checked', false);
    fireEvent.click(bold);
    expect(ops).toEqual([{ op: 'setScalar', keys: [...STYLE, 'fontWeight'], value: 'bold' }]);
    expect(
      section().queryByText(
        'いまの文字の太さ: 600（定義ファイルに直接書かれた値です。「太字をおすすめ」にすると置き換わります）',
      ),
    ).toBeNull();
  });

  it('says clearing writes nothing only while no hand-written weight remains', () => {
    draw();
    const note = '「指定なし」で太字もなければ、この 2 つは定義に書きません。';
    select('合計');
    expect(section().queryByText(note)).toBeNull();
    select('メモ');
    expect(section().getByText(note)).toBeTruthy();
  });

  it('creates the bag with the first hint and removes it with the last', () => {
    const ops = draw();
    select('メモ');
    expect(section().queryByText(/このほかの指定/)).toBeNull();
    fireEvent.click(section().getByRole('checkbox', { name: '太字をおすすめ' }));
    fireEvent.click(section().getByRole('checkbox', { name: '太字をおすすめ' }));
    expect(ops).toEqual([
      {
        op: 'setScalar',
        keys: ['properties', 'memo', 'recommendedStyle', 'fontWeight'],
        value: 'bold',
      },
      { op: 'removeKey', keys: ['properties', 'memo', 'recommendedStyle'] },
    ]);
  });

  it('keeps an authored alignment outside the three as its own selected segment', () => {
    const ops = draw();
    select('両端');
    expect(align('justify')).toHaveProperty('checked', true);
    fireEvent.click(section().getByRole('checkbox', { name: '太字をおすすめ' }));
    expect(align('justify')).toHaveProperty('checked', true);
    fireEvent.click(align('左'));
    expect(ops.at(-1)).toMatchObject({ value: 'left' });
    expect(section().queryByRole('radio', { name: 'justify' })).toBeNull();
  });

  it('reports a bag it cannot merge into, with no controls', () => {
    draw();
    select('変');
    expect(
      section().getByText(
        /この項目の「ほかのツール向けの情報」は、定義ファイルに直接書かれた形のため、ここでは変更できません。/,
      ),
    ).toBeTruthy();
    expect(section().queryByRole('checkbox')).toBeNull();
  });

  it('disables the controls on a read-only host', () => {
    draw(false);
    select('合計');
    expect(align('左')).toHaveProperty('disabled', true);
    expect(section().getByRole('checkbox', { name: '太字をおすすめ' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('a table’s row name', () => {
  it('reads, edits and clears items.title, and authors nothing unchanged', () => {
    const ops = draw();
    select('明細');
    const name = section().getByRole('textbox', { name: '1 行の呼び名' });
    expect(name).toHaveProperty('value', '明細行');
    fireEvent.blur(name, { target: { value: '明細行' } });
    expect(ops).toEqual([]);
    fireEvent.blur(name, { target: { value: '行' } });
    fireEvent.blur(section().getByRole('textbox', { name: '1 行の呼び名' }), {
      target: { value: '' },
    });
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'lines', 'items', 'title'], value: '行' },
      { op: 'removeKey', keys: ['properties', 'lines', 'items', 'title'] },
    ]);
  });

  it('is absent on a group and on a list (whose values print verbatim)', () => {
    draw();
    for (const label of ['情報', 'タグ']) {
      select(label);
      expect(
        screen.queryByRole('heading', { level: 3, name: 'ほかのツール向けの情報' }),
      ).toBeNull();
    }
  });
});
