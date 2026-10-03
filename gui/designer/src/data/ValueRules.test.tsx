// The value-rule sections of the data-item editor, driven through the whole
// editor over a LIVE definitions harness (every op the host receives is applied,
// so the pane re-reads what was written): the choices toggle, table, add row,
// confirm, reorder (buttons and grip drag), notices and read-only arms; the
// ranges per kind with their refusals; the placeholder; the example per type
// (and on a sample-read-only host); a list's 「1 つ 1 つの値」; and the rail's
// 「· 選択肢」 mark. The ops recorded are the load-bearing half of each case.

import type { Op } from '@shojiku/designer-core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { DataEditorView, type DataEditorViewProps } from './DataEditorView';
import { applyDefinitionOps } from './definitionsEdit';

const DEFS = `type: object
properties:
  status:
    type: string
    title: 状態
    enum:
      - draft
      - { value: sent, label: 送付済み }
      - paid
  total: { type: number, title: 合計 }
  qty: { type: integer, title: 数量, enum: [ 1, "2" ] }
  memo: { type: string, title: メモ }
  paidFlag: { type: boolean, title: 入金 }
  when: { type: string, format: date, title: 日付, enum: [ { value: "2024-01-01", label: 元日 } ] }
  hint: { type: string, format: person-name, title: 氏名, enum: [ { value: a, label: A } ] }
  weird: { type: string, title: 変, enum: [ [ 1 ] ] }
  ex: { type: string, title: 例つき, example: { a: 1 } }
  lines:
    type: array
    title: 明細
    items:
      type: object
      properties:
        sku: { type: string, title: 品番 }
  tags:
    type: array
    title: タグ
    items: { type: string, enum: [ red ] }
  bare: { type: array, title: 素のリスト }
`;

interface HarnessProps {
  readonly defs?: string;
  readonly over?: Partial<DataEditorViewProps>;
  readonly ops: Op[];
}

function Harness({ defs = DEFS, over, ops }: HarnessProps) {
  const [text, setText] = useState(defs);
  return (
    <I18nProvider locale="ja">
      <DataEditorView
        definitions={text}
        params="{}"
        templateText="sections: { body: { type: flow, items: [] } }"
        onDefinitionEdit={(op) => {
          ops.push(op);
          setText((current) => applyDefinitionOps(current, [op]));
          return true;
        }}
        onParamsChange={vi.fn()}
        onClose={vi.fn()}
        {...over}
      />
    </I18nProvider>
  );
}

function draw(props: Partial<HarnessProps> = {}) {
  const ops: Op[] = [];
  render(<Harness ops={ops} {...props} />);
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

const box = (name: string | RegExp) => screen.getByRole('textbox', { name });
const blur = (name: string | RegExp, value: string) =>
  fireEvent.blur(box(name), { target: { value } });
const toggle = () => screen.getByRole('checkbox', { name: '値を選択肢で決める' });
const sections = () =>
  screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace('?', '').trim());

describe('a field pane', () => {
  it('orders definition, choices, display, range and sample', () => {
    draw();
    select('状態');
    expect(sections()).toEqual(['定義', '選択肢', '表示', '文字数の範囲', 'サンプル値']);
    select('合計');
    expect(sections()).toEqual(['定義', '選択肢', '表示', '値の範囲', 'サンプル値']);
  });

  it('shows no choices and no range on a yes / no field with none authored', () => {
    draw();
    select('入金');
    expect(sections()).toEqual(['定義', '表示', 'サンプル値']);
  });
});

describe('choices', () => {
  it('reads every member, the printed text in its own column', () => {
    draw();
    select('状態');
    expect(toggle()).toHaveProperty('checked', true);
    expect(box('「draft」のデータの値')).toHaveProperty('value', 'draft');
    expect(box('「sent」の印字する文字')).toHaveProperty('value', '送付済み');
    expect(box('「paid」の印字する文字')).toHaveProperty('placeholder', '（データの値のまま）');
  });

  it('labels a member as ONE op over the list, and an unchanged blur authors nothing', () => {
    const ops = draw();
    select('状態');
    blur('「sent」の印字する文字', '送付済み');
    expect(ops).toEqual([]);
    blur('「draft」の印字する文字', '下書き');
    expect(ops).toEqual([
      {
        op: 'putValue',
        keys: ['properties', 'status', 'enum'],
        value: [{ value: 'draft', label: '下書き' }, { value: 'sent', label: '送付済み' }, 'paid'],
      },
    ]);
    expect(box('「draft」の印字する文字')).toHaveProperty('value', '下書き');
  });

  it('changes a value, and refuses a duplicate with the reason and no op', () => {
    const ops = draw();
    select('状態');
    blur('「paid」のデータの値', 'sent');
    expect(ops).toEqual([]);
    expect(screen.getByText('同じデータの値がすでにあります。')).toBeTruthy();
    blur('「paid」のデータの値', 'void');
    expect(ops).toHaveLength(1);
    expect(box('「void」のデータの値')).toBeTruthy();
  });

  it('adds a member from the add row on Enter, but not mid-composition', () => {
    const ops = draw();
    select('状態');
    fireEvent.click(screen.getByRole('button', { name: /選択肢を追加/ }));
    const value = box('データの値');
    fireEvent.change(value, { target: { value: 'void' } });
    fireEvent.change(box('印字する文字'), { target: { value: '無効' } });
    fireEvent.keyDown(value, { key: 'Enter', isComposing: true });
    expect(ops).toEqual([]);
    fireEvent.keyDown(value, { key: 'Enter' });
    expect(ops.at(-1)).toEqual({
      op: 'putValue',
      keys: ['properties', 'status', 'enum'],
      value: [
        'draft',
        { value: 'sent', label: '送付済み' },
        'paid',
        { value: 'void', label: '無効' },
      ],
    });
    expect(box('データの値')).toHaveProperty('value', '');
  });

  it('refuses a non-number on a number field, with the reason', () => {
    const ops = draw();
    select('合計');
    fireEvent.click(toggle());
    fireEvent.change(box('データの値'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'この選択肢を追加' }));
    expect(ops).toEqual([]);
    expect(screen.getByText('数値を入れてください。')).toBeTruthy();
    fireEvent.change(box('データの値'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'この選択肢を追加' }));
    expect(ops).toEqual([{ op: 'putValue', keys: ['properties', 'total', 'enum'], value: [1.5] }]);
  });

  it('refuses a member past what one change can hold, quoting the limit', () => {
    // 85 labeled members fill the budget exactly (1 + 85 × 3 = 256 nodes), so
    // even one bare member more is refused — with far fewer rows to render than
    // the 255-bare way to the same branch.
    const many = Array.from({ length: 85 }, (_, i) => `{ value: v${i}, label: L${i} }`).join(', ');
    const ops = draw({
      defs: `type: object\nproperties:\n  big: { type: string, title: 多い, enum: [ ${many} ] }\n`,
    });
    select('多い');
    fireEvent.click(screen.getByRole('button', { name: /選択肢を追加/ }));
    fireEvent.change(box('データの値'), { target: { value: 'one-more' } });
    fireEvent.click(screen.getByRole('button', { name: 'この選択肢を追加' }));
    expect(ops).toEqual([]);
    expect(
      screen.getByText(
        '選択肢はこれ以上増やせません。印字する文字のある選択肢は 3 個分と数え、全部で 255 個分までです。',
      ),
    ).toBeTruthy();
    expect(box('データの値')).toHaveProperty('value', 'one-more');
  });

  it('keeps the draft and says why when the host refuses the edit', () => {
    const ops: Op[] = [];
    render(
      <Harness
        ops={ops}
        over={{
          onDefinitionEdit: (op) => {
            ops.push(op);
            return false;
          },
        }}
      />,
    );
    select('合計');
    fireEvent.click(toggle());
    fireEvent.change(box('データの値'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'この選択肢を追加' }));
    expect(ops).toHaveLength(1);
    expect(box('データの値')).toHaveProperty('value', '5');
    expect(screen.getAllByText(/定義の編集は .*256/).length).toBeGreaterThan(0);
  });

  it('states an authored empty list without asking for a fix on a host that cannot edit', () => {
    draw({
      defs: 'type: object\nproperties:\n  e: { type: string, title: 空, enum: [] }\n',
      over: { onDefinitionEdit: undefined },
    });
    select('空');
    expect(
      screen.getByText('選択肢が 1 つもないため、どの値でも診断に警告が出ます。'),
    ).toBeTruthy();
  });

  it('warns on an authored empty list, and turning it off removes it at once', () => {
    const ops = draw({
      defs: 'type: object\nproperties:\n  e: { type: string, title: 空, enum: [] }\n',
    });
    select('空');
    expect(toggle()).toHaveProperty('checked', true);
    expect(
      screen.getByText(
        '選択肢が 1 つもないため、どの値でも診断に警告が出ます。 選択肢を追加するか、オフにしてください。',
      ),
    ).toBeTruthy();
    fireEvent.click(toggle());
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 'e', 'enum'] }]);
    expect(screen.queryByText(/本当に|オフにすると/)).toBeNull();
  });

  it('turns on with nothing written, and off again with nothing written', () => {
    const ops = draw();
    select('合計');
    expect(toggle()).toHaveProperty('checked', false);
    fireEvent.click(toggle());
    expect(toggle()).toHaveProperty('checked', true);
    expect(box('データの値')).toBeTruthy();
    fireEvent.click(toggle());
    expect(toggle()).toHaveProperty('checked', false);
    expect(ops).toEqual([]);
  });

  it('asks before removing a non-empty list, and removes the key on yes', () => {
    const ops = draw();
    select('状態');
    fireEvent.click(toggle());
    expect(screen.getByText('オフにすると、選択肢（3 個）を削除します。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(ops).toEqual([]);
    expect(screen.queryByText('オフにすると、選択肢（3 個）を削除します。')).toBeNull();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 'status', 'enum'] }]);
    expect(toggle()).toHaveProperty('checked', false);
  });

  it('removes a member, and the last one removes the key', () => {
    const ops = draw();
    select('タグ');
    fireEvent.click(screen.getByRole('button', { name: '「red」を削除' }));
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 'tags', 'items', 'enum'] }]);
  });

  it('moves a member with the buttons, focus following it', () => {
    const ops = draw();
    select('状態');
    fireEvent.click(screen.getByRole('button', { name: '「draft」を下へ移動' }));
    expect(ops.at(-1)).toEqual({
      op: 'putValue',
      keys: ['properties', 'status', 'enum'],
      value: [{ value: 'sent', label: '送付済み' }, 'draft', 'paid'],
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '「draft」を下へ移動' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '「paid」を上へ移動' }));
    expect(ops.at(-1)).toMatchObject({ value: [{ value: 'sent' }, 'paid', 'draft'] });
    expect(screen.getByRole('button', { name: '「sent」を上へ移動' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('moves the focus to the other button when a move reaches an end', () => {
    draw();
    select('状態');
    fireEvent.click(screen.getByRole('button', { name: '「sent」を上へ移動' }));
    expect(screen.getByRole('button', { name: '「sent」を上へ移動' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '「sent」を下へ移動' }));
  });

  it('commits a value on Enter, but not while an IME composition is open', () => {
    const ops = draw();
    select('状態');
    const input = box('「draft」の印字する文字');
    fireEvent.change(input, { target: { value: '下書き' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(ops).toEqual([]);
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ops).toHaveLength(1);
  });

  it('has a touch-safe grip only when the list can move', () => {
    draw();
    select('状態');
    const grips = document.querySelectorAll('[data-grip]');
    expect(grips).toHaveLength(3);
    for (const grip of grips) {
      expect(grip.className).toContain('touch-none');
    }
    select('タグ');
    expect(document.querySelector('[data-grip]')).toBeNull();
    expect(screen.queryByRole('button', { name: /を上へ/ })).toBeNull();
  });

  it('drags a member to the end as ONE op, painting the line on the way', () => {
    const ops = draw();
    select('状態');
    const grip = (index: number) => document.querySelectorAll('[data-grip]')[index] as HTMLElement;
    const list = grip(0).closest('ul') as HTMLElement;
    [...list.children].forEach((li, index) => {
      li.getBoundingClientRect = () => ({ top: index * 40, height: 40 }) as DOMRect;
    });
    const pointer = (type: string, init: PointerEventInit) =>
      act(() => {
        grip(0).dispatchEvent(
          new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, ...init }),
        );
      });
    pointer('pointerdown', { clientY: 10 });
    pointer('pointermove', { clientY: 115 });
    expect(list.querySelector('[data-drop="after"]')).not.toBeNull();
    pointer('pointerup', { clientY: 115 });
    expect(ops).toEqual([
      {
        op: 'putValue',
        keys: ['properties', 'status', 'enum'],
        value: [{ value: 'sent', label: '送付済み' }, 'paid', 'draft'],
      },
    ]);
  });

  it('paints the line BEFORE the member a drag would land above', () => {
    const ops = draw();
    select('状態');
    const grip = (index: number) => document.querySelectorAll('[data-grip]')[index] as HTMLElement;
    const list = grip(2).closest('ul') as HTMLElement;
    [...list.children].forEach((li, index) => {
      li.getBoundingClientRect = () => ({ top: index * 40, height: 40 }) as DOMRect;
    });
    const pointer = (type: string, init: PointerEventInit) =>
      act(() => {
        grip(2).dispatchEvent(
          new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, ...init }),
        );
      });
    pointer('pointerdown', { clientY: 90 });
    pointer('pointermove', { clientY: 5 });
    expect(list.children[0].querySelector('[data-drop="before"]')).not.toBeNull();
    pointer('pointerup', { clientY: 5 });
    expect(ops.at(-1)).toMatchObject({ value: ['paid', 'draft', { value: 'sent' }] });
  });

  it('says labels are ignored where the field does not print as text, and not otherwise', () => {
    draw();
    select('日付');
    expect(screen.getByText('この項目では、印字する文字は使われません。')).toBeTruthy();
    select('氏名');
    expect(screen.queryByText('この項目では、印字する文字は使われません。')).toBeNull();
    select('状態');
    expect(screen.queryByText('この項目では、印字する文字は使われません。')).toBeNull();
  });

  it('marks a member whose value is not of the field type, naming the type', () => {
    draw();
    select('数量');
    expect(box('「2」のデータの値').getAttribute('aria-invalid')).toBe('true');
    expect(box('「1」のデータの値').getAttribute('aria-invalid')).toBeNull();
    expect(
      screen.getByText(/「整数」の値になっていないため.*削除して追加し直してください。/),
    ).toBeTruthy();
  });

  it('states the mismatch without asking for a fix on a host that cannot edit', () => {
    draw({ over: { onDefinitionEdit: undefined } });
    select('数量');
    expect(
      screen.getByText(/「整数」の値になっていないため、データと一致しません。$/),
    ).toBeTruthy();
  });

  it('names a type it does not know verbatim', () => {
    draw({ defs: 'type: object\nproperties:\n  z: { type: text, title: 謎, enum: [ 1 ] }\n' });
    select('謎');
    expect(screen.getByText(/「text」の値になっていないため/)).toBeTruthy();
  });

  it('says an empty printed text prints the value only where printed text is used', () => {
    draw();
    select('状態');
    expect(screen.getByText(/印字する文字を空にすると/)).toBeTruthy();
    select('日付');
    expect(screen.queryByText(/印字する文字を空にすると/)).toBeNull();
  });

  it('leaves a list it cannot write back alone, with a note — but lets it be turned off', () => {
    const ops = draw();
    select('変');
    expect(screen.getByText(/ここでは編集できない書き方/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /選択肢を追加/ })).toBeNull();
    expect(ops).toEqual([]);
    fireEvent.click(toggle());
    expect(screen.getByText('オフにすると、選択肢（1 個）を削除します。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 'weird', 'enum'] }]);
  });

  it('asks before removing a value that is not even a list', () => {
    const ops = draw({
      defs: 'type: object\nproperties:\n  s: { type: string, title: 単, enum: draft }\n',
    });
    select('単');
    fireEvent.click(toggle());
    expect(screen.getByText('オフにすると、選択肢の設定をまるごと削除します。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 's', 'enum'] }]);
  });

  it('says why a refused yes / no pick snapped back', () => {
    const ops = draw({
      defs: 'type: object\nproperties:\n  ok: { type: boolean, title: 可否, enum: [ true, false ] }\n',
    });
    select('可否');
    fireEvent.change(screen.getByRole('combobox', { name: '「true」のデータの値' }), {
      target: { value: 'false' },
    });
    expect(ops).toEqual([]);
    expect(screen.getByText('同じデータの値がすでにあります。')).toBeTruthy();
  });

  it('offers no controls on a host that cannot edit definitions', () => {
    draw({ over: { onDefinitionEdit: undefined } });
    select('状態');
    expect(toggle()).toHaveProperty('disabled', true);
    expect(box('「draft」のデータの値')).toHaveProperty('readOnly', true);
    expect(document.querySelector('[data-grip]')).toBeNull();
    expect(screen.queryByRole('button', { name: /選択肢を追加|を削除|を上へ/ })).toBeNull();
    select('合計');
    expect(screen.queryByRole('checkbox', { name: '値を選択肢で決める' })).toBeNull();
  });

  it('edits an authored yes / no list through selects', () => {
    const ops = draw({
      defs: 'type: object\nproperties:\n  ok: { type: boolean, title: 可否, enum: [ true, "x" ] }\n',
    });
    select('可否');
    const value = screen.getByRole('combobox', { name: '「x」のデータの値' });
    expect(
      within(value)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['true', 'false', 'x']);
    fireEvent.change(value, { target: { value: 'false' } });
    expect(ops).toEqual([
      { op: 'putValue', keys: ['properties', 'ok', 'enum'], value: [true, false] },
    ]);
  });

  it('adds a yes / no member from a select', () => {
    const ops = draw({
      defs: 'type: object\nproperties:\n  ok: { type: boolean, title: 可否, enum: [ true ] }\n',
    });
    select('可否');
    fireEvent.click(screen.getByRole('button', { name: /選択肢を追加/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'データの値' }), {
      target: { value: 'false' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'この選択肢を追加' }));
    expect(ops).toEqual([
      { op: 'putValue', keys: ['properties', 'ok', 'enum'], value: [true, false] },
    ]);
  });
});

describe('ranges', () => {
  it('sets a bound and refuses a hostile magnitude with the reason', () => {
    const ops = draw();
    select('合計');
    blur('値の範囲の下限', '1e400');
    expect(ops).toEqual([]);
    expect(screen.getByText('数が大きすぎます。')).toBeTruthy();
    blur('値の範囲の下限', '-5');
    expect(ops).toEqual([{ op: 'setScalar', keys: ['properties', 'total', 'minimum'], value: -5 }]);
  });

  it('refuses a negative or fractional length, and clears with an empty entry', () => {
    const ops = draw();
    select('メモ');
    blur('文字数の範囲の上限', '-1');
    expect(screen.getByText('0 以上の数を入れてください。')).toBeTruthy();
    blur('文字数の範囲の上限', '1.5');
    expect(screen.getByText('整数を入れてください。')).toBeTruthy();
    blur('文字数の範囲の上限', '12');
    blur('文字数の範囲の上限', '');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'memo', 'maxLength'], value: 12 },
      { op: 'removeKey', keys: ['properties', 'memo', 'maxLength'] },
    ]);
  });

  it('refuses a non-number, and authors nothing for a blur that changed nothing', () => {
    const ops = draw({
      defs: 'type: object\nproperties:\n  m: { type: string, title: 欄, minLength: 1, placeholder: x, example: y }\n',
    });
    select('欄');
    blur('文字数の範囲の上限', 'abc');
    expect(screen.getByText('数値を入れてください。')).toBeTruthy();
    for (const [name, value] of [
      ['文字数の範囲の下限', '1'],
      ['文字数の範囲の上限', ''],
      ['空欄のときに出す文字', 'x'],
      ['サンプルを生成するときの例', 'y'],
    ]) {
      blur(name, value);
    }
    expect(ops).toEqual([]);
  });

  it('writes a negative zero length as 0, never as -0', () => {
    const ops = draw();
    select('メモ');
    blur('文字数の範囲の下限', '-0');
    expect(ops).toHaveLength(1);
    const op = ops[0] as { value: number };
    expect(Object.is(op.value, 0)).toBe(true);
  });

  it('warns while the lower bound is above the upper one', () => {
    draw();
    select('メモ');
    blur('文字数の範囲の下限', '10');
    blur('文字数の範囲の上限', '5');
    expect(
      screen.getByText('下限が上限より大きいため、どんなデータでも警告が出ます。'),
    ).toBeTruthy();
  });

  it('bounds a table by rows and a list by values', () => {
    const ops = draw();
    select('明細');
    expect(sections()).toContain('行数の範囲');
    blur('行数の範囲の上限', '30');
    select('タグ');
    blur('個数の範囲の下限', '1');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'lines', 'maxItems'], value: 30 },
      { op: 'setScalar', keys: ['properties', 'tags', 'minItems'], value: 1 },
    ]);
  });
});

describe('placeholder and example', () => {
  it('sets and clears the placeholder verbatim', () => {
    const ops = draw();
    select('メモ');
    blur('空欄のときに出す文字', ' — ');
    blur('空欄のときに出す文字', '');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'memo', 'placeholder'], value: ' — ' },
      { op: 'removeKey', keys: ['properties', 'memo', 'placeholder'] },
    ]);
  });

  it('types the example by the field, and refuses what the type cannot hold', () => {
    const ops = draw();
    select('合計');
    blur('サンプルを生成するときの例', 'abc');
    expect(screen.getByText('数値を入れてください。')).toBeTruthy();
    blur('サンプルを生成するときの例', '1200');
    select('入金');
    fireEvent.change(screen.getByRole('combobox', { name: 'サンプルを生成するときの例' }), {
      target: { value: 'true' },
    });
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'total', 'example'], value: 1200 },
      { op: 'setScalar', keys: ['properties', 'paidFlag', 'example'], value: true },
    ]);
    expect(screen.getAllByText('定義に保存 · 全バリアント共通').length).toBeGreaterThan(0);
  });

  it('stays editable when the sample data is read-only — it is a definitions key', () => {
    const ops = draw({ over: { sampleDataReadOnly: true } });
    select('メモ');
    blur('サンプルを生成するときの例', '山田');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'memo', 'example'], value: '山田' },
    ]);
  });

  it('shows a container example verbatim and leaves it alone', () => {
    draw();
    select('例つき');
    expect(screen.getByText('{"a":1}')).toBeTruthy();
    expect(screen.getByText(/この例は、ここでは編集できない書き方になっています。/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'サンプルを生成するときの例' })).toBeNull();
  });
});

describe('a list element', () => {
  it('edits the element at items: type, placeholder, length and choices', () => {
    const ops = draw();
    select('タグ');
    expect(sections()).toContain('1 つ 1 つの値');
    blur('空欄のときに出す文字', '-');
    blur('1 つあたりの文字数の範囲の上限', '12');
    blur('「red」の印字する文字', '赤');
    fireEvent.change(screen.getByRole('combobox', { name: '表すもの' }), {
      target: { value: 'date' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '型' }), { target: { value: 'number' } });
    const at = ['properties', 'tags', 'items'];
    expect(ops).toEqual([
      { op: 'setScalar', keys: [...at, 'placeholder'], value: '-' },
      { op: 'setScalar', keys: [...at, 'maxLength'], value: 12 },
      { op: 'putValue', keys: [...at, 'enum'], value: [{ value: 'red', label: '赤' }] },
      { op: 'setScalar', keys: [...at, 'format'], value: 'date' },
      { op: 'setScalar', keys: [...at, 'type'], value: 'number' },
    ]);
    expect(box('1 つあたりの値の範囲の下限')).toBeTruthy();
  });

  it('offers no range for a yes / no element', () => {
    draw({
      defs: 'type: object\nproperties:\n  flags: { type: array, title: 旗, items: { type: boolean } }\n',
    });
    select('旗');
    expect(screen.queryByRole('textbox', { name: /1 つあたり/ })).toBeNull();
    // Only the list's own 個数の範囲 carries the consequence line.
    expect(screen.getAllByText('外れると診断に警告が出ます。印刷は止まりません。')).toHaveLength(1);
  });

  it('asks for the type first on a list whose element has none, and writes it', () => {
    const ops = draw();
    select('素のリスト');
    // Any other key written first would leave `items` without its required
    // `type` — a parse error for the whole file — so nothing else is offered.
    expect(
      screen.getByText('まず「型」を選んでください。ほかの設定は、型を選ぶと出てきます。'),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /1 つあたり|空欄のときに出す文字/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: '表すもの' })).toBeNull();
    const type = screen.getByRole('combobox', { name: '型' });
    expect(type).toHaveProperty('value', '');
    fireEvent.change(type, { target: { value: 'string' } });
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'bare', 'items', 'type'], value: 'string' },
    ]);
    expect(box('1 つあたりの文字数の範囲の上限')).toBeTruthy();
  });

  it('says a list prints its values as they are: no blank text, no printed text', () => {
    draw();
    select('タグ');
    expect(
      screen.getByText(
        'リストの値はそのまま印字されるため、この文字はいまは印字に使われません（定義に記録されます）。',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/印字する文字を空にすると/)).toBeNull();
    blur('「red」の印字する文字', '赤');
    expect(screen.getByText(/リストの値はデータの値のまま印字されるため/)).toBeTruthy();
    expect(screen.queryByText('この項目では、印字する文字は使われません。')).toBeNull();
  });
});

describe('the rail', () => {
  it('marks a field and a list element that declare choices', () => {
    draw();
    const nav = within(screen.getByRole('navigation'));
    // 状態, 氏名, 変: text fields with choices (a list the editor cannot write
    // back still declares them); メモ has none.
    expect(nav.getAllByText('テキスト · 選択肢')).toHaveLength(3);
    expect(nav.getByText('数値 · 選択肢')).toBeTruthy();
    expect(nav.getByText('リスト · 選択肢')).toBeTruthy();
    expect(nav.getAllByText('リスト')).toHaveLength(1);
    expect(nav.getAllByText('表')).toHaveLength(1);
  });
});
