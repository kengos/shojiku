import type { Op } from '@shojiku/designer-core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { DataEditorView, type DataEditorViewProps } from './DataEditorView';
import { readAt } from './editorModel';

describe('readAt', () => {
  it('reads a scalar at a nested path', () => {
    expect(readAt(JSON.stringify({ a: { b: 'x' } }), ['a', 'b'])).toBe('x');
  });
  it('stringifies number/boolean leaves', () => {
    expect(readAt(JSON.stringify({ n: 3, ok: true }), ['n'])).toBe('3');
    expect(readAt(JSON.stringify({ n: 3, ok: true }), ['ok'])).toBe('true');
  });
  it('returns empty for a numeric segment out of the array range', () => {
    expect(readAt(JSON.stringify({ rows: ['a'] }), ['rows', 5])).toBe('');
  });
  it('returns empty for a numeric segment against a non-array', () => {
    expect(readAt(JSON.stringify({ rows: 'nope' }), ['rows', 0])).toBe('');
  });
  it('returns empty when descending past a non-object', () => {
    expect(readAt(JSON.stringify({ a: 'x' }), ['a', 'b'])).toBe('');
  });
  it('returns empty for a non-scalar leaf and unreadable params', () => {
    expect(readAt(JSON.stringify({ a: { b: 1 } }), ['a'])).toBe('');
    expect(readAt('nope', ['a'])).toBe('');
  });
});

const DEFS = `type: object
properties:
  title:
    type: string
    title: 表示タイトル
    description: 見出しに使う文字
  amount:
    type: number
    format: currency
  active:
    type: boolean
  when:
    type: string
    format: date
  ts:
    type: string
    format: date-time
  ts2:
    type: string
    format: date-time
  bare:
    title: 素の項目
  items:
    type: array
    title: 明細
    items:
      type: object
      properties:
        name:
          type: string
`;

const PARAMS = JSON.stringify({
  title: 'こんにちは',
  amount: 100,
  active: true,
  when: '2024-01-02',
  ts: '2024-01-02T03:04:05+09:00',
  ts2: '2024-01-02T03:04+09:00',
  bare: 'そのまま',
  items: [{ name: 'A' }, { name: 'B' }],
});

const TEMPLATE = `sections:
  body:
    type: flow
    items:
      - { type: text, data: { key: title } }
`;

function draw(over: Partial<DataEditorViewProps> = {}) {
  const mocks = {
    onDefinitionEdit: vi.fn<(op: Op) => void>(),
    onParamsChange: vi.fn<(params: string) => void>(),
    onClose: vi.fn<() => void>(),
  };
  const props: DataEditorViewProps = {
    definitions: DEFS,
    params: PARAMS,
    templateText: TEMPLATE,
    ...mocks,
    ...over,
  };
  return {
    ...render(
      <I18nProvider locale="ja">
        <DataEditorView {...props} />
      </I18nProvider>,
    ),
    props,
    mocks,
  };
}

function selectField(label: string) {
  const nav = screen.getByRole('navigation');
  const row = within(nav)
    .getAllByRole('button')
    .find((b) => (b.textContent ?? '').includes(label));
  if (row === undefined) {
    throw new Error(`no row for ${label}`);
  }
  fireEvent.click(row);
}

describe('DataEditorView list', () => {
  it('lists the definition fields grouped, with a usage chip', () => {
    draw();
    const nav = screen.getByRole('navigation');
    // The `title` field is bound in the template → used ×1.
    expect(within(nav).getByText('表示タイトル')).not.toBeNull();
    expect(within(nav).getAllByText(/箇所で使用/).length).toBeGreaterThan(0);
  });

  it('filters the list by the search query', () => {
    draw();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'amount' } });
    const nav = screen.getByRole('navigation');
    expect(within(nav).queryByText('表示タイトル')).toBeNull();
    expect(within(nav).getAllByText('amount').length).toBeGreaterThan(0);
  });

  it('shows the no-matches note for a query that hits nothing', () => {
    draw();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzz' } });
    expect(screen.getByText('一致する項目はありません。')).not.toBeNull();
  });

  it('shows the empty note when there are no definitions', () => {
    draw({ definitions: '' });
    expect(screen.getByText('データ項目はありません。')).not.toBeNull();
  });

  it('reveals a field description through the help hint', () => {
    draw();
    const nav = screen.getByRole('navigation');
    // The row carries a help affordance revealing the description.
    expect(within(nav).getByRole('button', { name: '説明' })).not.toBeNull();
  });

  it('closes via the header button', () => {
    const { mocks } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'キャンバスへ戻る' }));
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });

  it('prompts to select a field before one is chosen', () => {
    draw();
    expect(screen.getByText(/左の一覧から項目を選ぶと/)).not.toBeNull();
  });
});

describe('DataEditorView definition editing', () => {
  it('edits the display label (title) with a changed-guard', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    const input = screen.getByLabelText('表示ラベル') as HTMLInputElement;
    // An unchanged blur authors nothing.
    fireEvent.blur(input);
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '新タイトル' } });
    fireEvent.blur(input);
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['properties', 'title', 'title'],
      value: '新タイトル',
    });
  });

  it('edits the type through the picker', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    fireEvent.change(screen.getByLabelText('型'), { target: { value: 'number' } });
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['properties', 'title', 'type'],
      value: 'number',
    });
  });

  it('clears the description via removeKey on empty', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    const area = screen.getByRole('textbox', { name: '説明' }) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: '' } });
    fireEvent.blur(area);
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'removeKey',
      keys: ['properties', 'title', 'description'],
    });
  });

  it('edits the format through the FormatPicker', () => {
    const { mocks } = draw();
    selectField('amount');
    const input = screen.getByLabelText('表示形式') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'symbol' } });
    fireEvent.blur(input);
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['properties', 'amount', 'format'],
      value: 'symbol',
    });
  });

  it('renders the definition form read-only when not editable', () => {
    draw({ definitions: DEFS, onDefinitionEdit: undefined });
    selectField('表示タイトル');
    expect((screen.getByLabelText('表示ラベル') as HTMLInputElement).readOnly).toBe(true);
  });

  it('renders hostile definition strings as escaped text, never markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const defs = `type: object
properties:
  memo:
    type: string
    title: '${hostile}'
    description: '${hostile}'
`;
    const { container } = draw({
      definitions: defs,
      params: JSON.stringify({ memo: hostile }),
    });
    selectField(hostile);
    // The strings appear as literal TEXT (list row, form seeds, sample value)…
    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
    expect((screen.getByLabelText('表示ラベル') as HTMLInputElement).value).toBe(hostile);
    expect((screen.getByLabelText('サンプル値') as HTMLTextAreaElement).value).toBe(hostile);
    // …and no element was ever minted from them.
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('DataEditorView sample editing', () => {
  it('edits a string value in the roomy textarea', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    const area = screen.getByLabelText('サンプル値') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('こんにちは');
    fireEvent.change(area, { target: { value: 'さようなら' } });
    fireEvent.blur(area);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).title).toBe('さようなら');
  });

  it('a same-value blur authors nothing', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    fireEvent.blur(screen.getByLabelText('サンプル値'));
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('edits a number value', () => {
    const { mocks } = draw();
    selectField('amount');
    const input = screen.getByLabelText('サンプル値') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).amount).toBe(250);
  });

  it('edits a boolean value via the checkbox', () => {
    const { mocks } = draw();
    selectField('active');
    const box = screen.getByLabelText('サンプル値') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    fireEvent.click(box);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).active).toBe(false);
  });

  it('edits a date value', () => {
    const { mocks } = draw();
    selectField('when');
    const input = screen.getByLabelText('サンプル値') as HTMLInputElement;
    expect(input.type).toBe('date');
    fireEvent.change(input, { target: { value: '2025-06-07' } });
    fireEvent.blur(input);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).when).toBe('2025-06-07');
  });

  it('edits a datetime value, recomposing the offset', () => {
    const { mocks } = draw();
    selectField('ts');
    const input = screen.getByLabelText('サンプル値') as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    fireEvent.change(input, { target: { value: '2024-01-02T05:06' } });
    fireEvent.blur(input);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).ts).toContain('+09:00');
  });

  it('a blank datetime blur authors nothing', () => {
    const { mocks } = draw();
    selectField('ts');
    const input = screen.getByLabelText('サンプル値') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('edits array-group rows and adds/removes a row', () => {
    const { mocks } = draw();
    selectField('name');
    // Two rows, each an editable `name`.
    const inputs = screen.getAllByLabelText('name') as HTMLTextAreaElement[];
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: 'AA' } });
    fireEvent.blur(inputs[0]);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).items[0].name).toBe('AA');
    fireEvent.click(screen.getByText('行を追加'));
    expect(JSON.parse(mocks.onParamsChange.mock.calls.at(-1)?.[0] ?? '').items).toHaveLength(3);
    fireEvent.click(screen.getAllByText('削除')[0]);
    expect(JSON.parse(mocks.onParamsChange.mock.calls.at(-1)?.[0] ?? '').items).toHaveLength(1);
  });

  it('a typeless field seeds the type select to string and shows the raw type', () => {
    draw();
    selectField('素の項目');
    // The 型 picker seeds to string for an unset type.
    expect((screen.getByLabelText('型') as HTMLSelectElement).value).toBe('string');
    // Its sample widget is the string textarea.
    expect((screen.getByLabelText('サンプル値') as HTMLElement).tagName).toBe('TEXTAREA');
  });

  it('a minute-precision datetime needs no seconds step', () => {
    draw();
    selectField('ts2');
    const input = screen.getByLabelText('サンプル値') as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    expect(input.step).toBe('');
  });

  it('a same-value number blur (after coercion) authors nothing', () => {
    const { mocks } = draw();
    selectField('amount');
    const input = screen.getByLabelText('サンプル値') as HTMLInputElement;
    // '100.0' differs as a string but coerces to the current 100.
    fireEvent.change(input, { target: { value: '100.0' } });
    fireEvent.blur(input);
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('an unchanged number blur authors nothing', () => {
    const { mocks } = draw();
    selectField('amount');
    fireEvent.blur(screen.getByLabelText('サンプル値'));
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('an array field with no rows in params shows the empty note', () => {
    draw({ params: JSON.stringify({ title: 'x' }) });
    selectField('name');
    expect(screen.getByText('サンプルデータはありません。')).not.toBeNull();
  });

  it('creates a fresh top-level scalar not yet present in params', () => {
    // A field declared in definitions but absent from params.
    const defs = `type: object
properties:
  memo:
    type: string
`;
    const { mocks } = draw({ definitions: defs, params: '{}' });
    selectField('memo');
    const area = screen.getByLabelText('サンプル値') as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: 'first' } });
    fireEvent.blur(area);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).memo).toBe('first');
  });
});

describe('DataEditorView enum select (the approved-mock states)', () => {
  const ENUM_DEFS = `type: object
properties:
  status:
    type: string
    title: 入荷状況
    enum:
      - { value: arrived, label: 入荷済み }
      - { value: backorder, label: （入荷待ち） }
  kind:
    type: string
    title: 区切り種別
    enum: [section, end]
  books:
    type: array
    title: 明細行
    items:
      type: object
      properties:
        state:
          type: string
          title: 行状態
          enum:
            - { value: open, label: 受付中 }
            - { value: done, label: 完了 }
`;

  function drawEnum(params: Record<string, unknown>, over: Partial<DataEditorViewProps> = {}) {
    return draw({ definitions: ENUM_DEFS, params: JSON.stringify(params), ...over });
  }

  it('a labeled enum renders a select of labels with the raw-value caption', () => {
    drawEnum({ status: 'backorder' });
    selectField('入荷状況');
    const select = screen.getByLabelText('サンプル値') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      '入荷済み',
      '（入荷待ち）',
    ]);
    expect(select.value).toBe('backorder');
    expect(screen.getByText('params の値: backorder')).not.toBeNull();
  });

  it('an unlabeled enum renders its values as the options, with no caption', () => {
    drawEnum({ kind: 'section' });
    selectField('区切り種別');
    const select = screen.getByLabelText('サンプル値') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['section', 'end']);
    expect(screen.queryByText(/params の値/)).toBeNull();
  });

  it('picking an option commits the VALUE, not the label', () => {
    const { mocks } = drawEnum({ status: 'backorder' });
    selectField('入荷状況');
    fireEvent.change(screen.getByLabelText('サンプル値'), { target: { value: 'arrived' } });
    expect(mocks.onParamsChange).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mocks.onParamsChange.mock.calls[0][0] as string);
    expect(written.status).toBe('arrived');
  });

  it('a same-value change commits nothing', () => {
    const { mocks } = drawEnum({ status: 'backorder' });
    selectField('入荷状況');
    fireEvent.change(screen.getByLabelText('サンプル値'), { target: { value: 'backorder' } });
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('an out-of-enum current value stays visible, warned, and pickable-away-from', () => {
    const { mocks } = drawEnum({ status: 'canceld' });
    selectField('入荷状況');
    const select = screen.getByLabelText('サンプル値') as HTMLSelectElement;
    expect(select.value).toBe('canceld');
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'arrived',
      'backorder',
      'canceld',
    ]);
    expect(screen.getByText('この値は宣言された選択肢にありません。')).not.toBeNull();
    // No raw caption while undeclared — the warning already shows the value.
    expect(screen.queryByText(/params の値/)).toBeNull();
    fireEvent.change(select, { target: { value: 'arrived' } });
    const written = JSON.parse(mocks.onParamsChange.mock.calls[0][0] as string);
    expect(written.status).toBe('arrived');
  });

  it('array rows render the select per row without the caption', () => {
    drawEnum({ books: [{ state: 'open' }, { state: 'done' }] });
    selectField('行状態');
    const selects = screen.getAllByLabelText('行状態') as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    expect(selects[0].value).toBe('open');
    expect(selects[1].value).toBe('done');
    expect(screen.queryByText(/params の値/)).toBeNull();
  });

  it('read-only shows the label with the machine value beside it', () => {
    drawEnum({ status: 'backorder' }, { sampleDataReadOnly: true });
    selectField('入荷状況');
    expect(screen.queryByLabelText('サンプル値')).toBeNull();
    expect(screen.getByText('（入荷待ち）')).not.toBeNull();
    expect(screen.getByText('backorder')).not.toBeNull();
  });

  it('a saturated enum falls back to free entry rather than a truncated select', () => {
    const values = Array.from({ length: 64 }, (_, i) => `v${i}`)
      .map((v) => `      - ${v}`)
      .join('\n');
    const defs = `type: object
properties:
  big:
    type: string
    title: 大きな集合
    enum:
${values}
`;
    draw({ definitions: defs, params: JSON.stringify({ big: 'v1' }) });
    selectField('大きな集合');
    const field = screen.getByLabelText('サンプル値');
    expect(field.tagName).toBe('TEXTAREA');
  });
});

describe('DataEditorView read-only sample', () => {
  it('shows values as text, no inputs, and the engineer hint', () => {
    draw({ sampleDataReadOnly: true });
    expect(screen.getByText(/エンジニアが管理/)).not.toBeNull();
    selectField('表示タイトル');
    expect(screen.queryByLabelText('サンプル値')).toBeNull();
    expect(screen.getByText('こんにちは')).not.toBeNull();
  });

  it('shows an empty read-only value note', () => {
    const defs = `type: object
properties:
  memo:
    type: string
`;
    draw({ definitions: defs, params: '{}', sampleDataReadOnly: true });
    selectField('memo');
    expect(screen.getByText('サンプルデータはありません。')).not.toBeNull();
  });

  it('read-only array group shows the rows as text, no add/remove', () => {
    draw({ sampleDataReadOnly: true });
    selectField('name');
    expect(screen.queryByText('行を追加')).toBeNull();
    expect(screen.getByText('A')).not.toBeNull();
  });
});

describe('DataEditorView project-scope hint', () => {
  it('shows the impact-scope hint when definitions are project-scoped and editable', () => {
    draw({ definitionsProjectScoped: true });
    expect(screen.getByText(/プロジェクト全体で共有/)).not.toBeNull();
  });

  it('hides the hint when definitions are not project-scoped (standalone)', () => {
    draw({ definitionsProjectScoped: false });
    expect(screen.queryByText(/プロジェクト全体で共有/)).toBeNull();
  });

  it('hides the hint when definitions are not editable, even if project-scoped', () => {
    draw({ definitionsProjectScoped: true, onDefinitionEdit: undefined });
    expect(screen.queryByText(/プロジェクト全体で共有/)).toBeNull();
  });
});

describe('DataEditorView add-field', () => {
  it('adds a fresh field as a putValue op', () => {
    const { mocks } = draw();
    fireEvent.change(screen.getByLabelText('項目名'), { target: { value: 'memo' } });
    fireEvent.click(screen.getByRole('button', { name: 'データ項目を追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'putValue',
      keys: ['properties', 'memo'],
      value: { type: 'string' },
    });
  });

  it('disables the add button until a name is typed', () => {
    draw();
    expect(
      (screen.getByRole('button', { name: 'データ項目を追加' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('refuses an existing key with a localized notice', () => {
    const { mocks } = draw();
    fireEvent.change(screen.getByLabelText('項目名'), { target: { value: 'title' } });
    fireEvent.click(screen.getByRole('button', { name: 'データ項目を追加' }));
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
    expect(screen.getByText(/同じ名前/)).not.toBeNull();
  });

  it('refuses an over-long name', () => {
    const { mocks } = draw();
    fireEvent.change(screen.getByLabelText('項目名'), { target: { value: 'x'.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: 'データ項目を追加' }));
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
  });

  it('an IME kanji-confirm Enter never submits the add-field form', () => {
    const { mocks } = draw();
    const input = screen.getByLabelText('項目名');
    fireEvent.change(input, { target: { value: 'memo' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
    // A plain Enter (composition settled) submits as usual.
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(mocks.onDefinitionEdit).toHaveBeenCalled();
  });

  it('adds a field of a picked non-default type', () => {
    const { mocks } = draw();
    fireEvent.change(screen.getByLabelText('項目名'), { target: { value: 'qty' } });
    fireEvent.change(screen.getByLabelText('種類'), { target: { value: 'integer' } });
    fireEvent.click(screen.getByRole('button', { name: 'データ項目を追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'putValue',
      keys: ['properties', 'qty'],
      value: { type: 'integer' },
    });
  });
});

describe('DataEditorView document-level sample controls', () => {
  const set = {
    active: 'default',
    variants: [
      { origin: 'preset' as const, id: 'default', labels: { ja: '記入例' }, text: PARAMS },
    ],
  };

  it('generates missing params via the CTA', () => {
    const defs = `type: object
properties:
  a: { type: string }
  b: { type: string }
`;
    const { mocks } = draw({ definitions: defs, params: JSON.stringify({ a: 'x' }) });
    fireEvent.click(screen.getByText('サンプルデータを生成'));
    expect(Object.keys(JSON.parse(mocks.onParamsChange.mock.calls[0][0]))).toContain('b');
  });

  it('undoes via the panel-local undo button', () => {
    const onUndo = vi.fn();
    draw({ canUndo: true, onUndo });
    fireEvent.click(screen.getByText('編集を元に戻す'));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('undoes a definition edit via the left-rail definition undo button', () => {
    const onUndoDefinition = vi.fn();
    draw({ canUndoDefinition: true, onUndoDefinition });
    fireEvent.click(screen.getByText('定義の編集を元に戻す'));
    expect(onUndoDefinition).toHaveBeenCalledOnce();
  });

  it('disables the definition undo button when there is nothing to undo', () => {
    const onUndoDefinition = vi.fn();
    draw({ canUndoDefinition: false, onUndoDefinition });
    const button = screen.getByText('定義の編集を元に戻す') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onUndoDefinition).not.toHaveBeenCalled();
  });

  it('omits the definition undo button when no undo handler is wired', () => {
    draw({ onUndoDefinition: undefined });
    expect(screen.queryByText('定義の編集を元に戻す')).toBeNull();
  });

  it('switches, adds and removes a variant', () => {
    const two = {
      active: 'default',
      variants: [
        { origin: 'preset' as const, id: 'default', labels: { ja: '記入例' }, text: PARAMS },
        { origin: 'user' as const, id: 'user-1', name: 'コピー', text: PARAMS },
      ],
    };
    const onSwitch = vi.fn();
    const onCommit = vi.fn();
    draw({ variants: { set: two, onSwitch, onCommit } });
    // Switch via the bar's select.
    fireEvent.change(screen.getByLabelText('サンプル切替'), { target: { value: 'user-1' } });
    expect(onSwitch).toHaveBeenCalledWith('user-1');
    // Add.
    fireEvent.change(screen.getByLabelText('バリアント名'), { target: { value: '新規' } });
    fireEvent.click(screen.getByText('バリアントを追加'));
    expect(onCommit).toHaveBeenCalled();
  });

  it('surfaces a variant-add refusal', () => {
    const onCommit = vi.fn();
    draw({ variants: { set, onSwitch: vi.fn(), onCommit } });
    // An empty name is refused.
    fireEvent.click(screen.getByText('バリアントを追加'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/入力してください/)).not.toBeNull();
  });

  const withUser = {
    active: 'user-1',
    variants: [
      { origin: 'preset' as const, id: 'default', labels: { ja: '記入例' }, text: PARAMS },
      { origin: 'user' as const, id: 'user-1', name: 'コピー', text: PARAMS },
    ],
  };

  it('deletes the active user variant through the two-step confirm', () => {
    const onCommit = vi.fn();
    draw({ variants: { set: withUser, onSwitch: vi.fn(), onCommit } });
    fireEvent.click(screen.getByText('バリアントを削除'));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    const committed = onCommit.mock.calls.at(-1)?.[0];
    expect(committed.variants).toHaveLength(1);
  });

  it('cancels a variant delete without committing', () => {
    const onCommit = vi.fn();
    draw({ variants: { set: withUser, onSwitch: vi.fn(), onCommit } });
    fireEvent.click(screen.getByText('バリアントを削除'));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCommit).not.toHaveBeenCalled();
    // The trigger is back.
    expect(screen.getByText('バリアントを削除')).not.toBeNull();
  });

  it('surfaces a variant-delete refusal (the last variant cannot go)', () => {
    const onCommit = vi.fn();
    const lone = {
      active: 'user-1',
      variants: [{ origin: 'user' as const, id: 'user-1', name: 'のみ', text: PARAMS }],
    };
    draw({ variants: { set: lone, onSwitch: vi.fn(), onCommit } });
    fireEvent.click(screen.getByText('バリアントを削除'));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/削除できません/)).not.toBeNull();
  });
});

describe('DataEditorView selection resolution', () => {
  it('drops the selection when the field disappears from the definitions', () => {
    const { rerender, props } = draw();
    selectField('表示タイトル');
    expect(screen.getByLabelText('表示ラベル')).not.toBeNull();
    // Re-render with definitions lacking `title` → the selection resolves to
    // nothing and the select-hint returns.
    rerender(
      <I18nProvider locale="ja">
        <DataEditorView
          {...props}
          definitions={'type: object\nproperties:\n  other:\n    type: string\n'}
        />
      </I18nProvider>,
    );
    expect(screen.queryByLabelText('表示ラベル')).toBeNull();
    expect(screen.getByText(/左の一覧から項目を選ぶと/)).not.toBeNull();
  });
});
