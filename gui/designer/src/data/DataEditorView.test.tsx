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
    onDefinitionEdit: vi.fn<(op: Op) => boolean | undefined>(),
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
  it('names the view and the field list SEPARATELY', () => {
    // One key used to label the region, the heading AND the inner `<nav>`. The
    // heading has to match the menu row that opened it (`menu.dataEditor`,
    // gui/STYLE.md § Actions), and that wording describes the VIEW — naming the
    // field list "edit data fields" too would leave a landmark saying nothing
    // about what it contains, and two landmarks sharing one accessible name.
    draw();
    expect(screen.getByRole('heading', { name: 'データ項目を編集' })).not.toBeNull();
    expect(screen.getByRole('region', { name: 'データ項目を編集' })).not.toBeNull();
    expect(screen.getByRole('navigation', { name: 'データ項目' })).not.toBeNull();
  });

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

  it('edits the semantic format from the closed set', () => {
    // This case used to type `symbol` — a DISPLAY variant — into the semantic
    // `format:` key and assert it was written. That write did nothing: the
    // engine's `(type, format)` table does not know `symbol`, and an
    // unrecognised value is treated as a generation hint and never warns. The
    // control now offers only what the table accepts, and the old assertion is
    // kept below as the thing that must no longer be possible.
    const { mocks } = draw();
    selectField('amount');
    const select = screen.getByLabelText('表すもの') as HTMLSelectElement;
    // Not `currency`: the fixture already declares it, and the op builder
    // returns null when nothing changed — so that value would prove nothing.
    fireEvent.change(select, { target: { value: 'percentage' } });
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['properties', 'amount', 'format'],
      value: 'percentage',
    });
  });

  it('does not offer a display variant for the semantic format key', () => {
    draw();
    selectField('amount');
    const select = screen.getByLabelText('表すもの') as HTMLSelectElement;
    const offered = [...select.options].map((o) => o.value);
    expect(offered).not.toContain('symbol');
    expect(offered).not.toContain('wareki');
    expect(offered).toEqual(['', 'currency', 'percentage', 'quantity']);
  });

  it('shows an open-vocabulary format verbatim instead of reporting it unset', () => {
    // `format:` is an OPEN vocabulary (`schema.rs`): a value outside the
    // refiner table is a generation hint that leaves the base type alone.
    // A closed select would match no option and fall to the not-set row, so
    // the editor would tell the author the field represents nothing — and
    // the next change to the control would overwrite the hint for good.
    draw({
      definitions: `type: object
properties:
  customer:
    type: string
    format: person-name
`,
    });
    selectField('customer');
    const select = screen.getByLabelText('表すもの') as HTMLSelectElement;
    expect(select.value).toBe('person-name');
    expect([...select.options].map((o) => o.value)).toContain('person-name');
  });

  it('clears the semantic format back to the bare type', () => {
    const { mocks } = draw();
    selectField('amount');
    const select = screen.getByLabelText('表すもの') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'currency' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'removeKey',
      keys: ['properties', 'amount', 'format'],
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
    expect((screen.getByLabelText(hostile) as HTMLTextAreaElement).value).toBe(hostile);
    // …and no element was ever minted from them.
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('DataEditorView sample editing', () => {
  it('edits a string value in the roomy textarea', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    const area = screen.getByLabelText('表示タイトル') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('こんにちは');
    fireEvent.change(area, { target: { value: 'さようなら' } });
    fireEvent.blur(area);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).title).toBe('さようなら');
  });

  it('a same-value blur authors nothing', () => {
    const { mocks } = draw();
    selectField('表示タイトル');
    fireEvent.blur(screen.getByLabelText('表示タイトル'));
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('edits a number value', () => {
    const { mocks } = draw();
    selectField('amount');
    const input = screen.getByLabelText('amount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).amount).toBe(250);
  });

  it('edits a boolean value via the checkbox', () => {
    const { mocks } = draw();
    selectField('active');
    const box = screen.getByLabelText('active') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    fireEvent.click(box);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).active).toBe(false);
  });

  it('edits a date value', () => {
    const { mocks } = draw();
    selectField('when');
    const input = screen.getByLabelText('when') as HTMLInputElement;
    expect(input.type).toBe('date');
    fireEvent.change(input, { target: { value: '2025-06-07' } });
    fireEvent.blur(input);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).when).toBe('2025-06-07');
  });

  it('edits a datetime value, recomposing the offset', () => {
    const { mocks } = draw();
    selectField('ts');
    const input = screen.getByLabelText('ts') as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    fireEvent.change(input, { target: { value: '2024-01-02T05:06' } });
    fireEvent.blur(input);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).ts).toContain('+09:00');
  });

  it('a blank datetime blur authors nothing, and takes the blank back', () => {
    // Authoring nothing and SHOWING nothing are two different failures, and
    // only the second is visible to the person editing. There is no blank RFC
    // 3339 value to write, so the sample does not move — which means the call
    // site's `key={value}` cannot reseed the field and only the nonce can.
    const { mocks } = draw();
    selectField('ts');
    const field = () => screen.getByLabelText('ts') as HTMLInputElement;
    const before = field().value;
    expect(before).not.toBe('');
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
    expect(field().value).toBe(before);
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
    expect((screen.getByLabelText('素の項目') as HTMLElement).tagName).toBe('TEXTAREA');
  });

  it('a minute-precision datetime needs no seconds step', () => {
    draw();
    selectField('ts2');
    const input = screen.getByLabelText('ts2') as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    expect(input.step).toBe('');
  });

  it('a same-value number blur (after coercion) authors nothing', () => {
    const { mocks } = draw();
    selectField('amount');
    const input = screen.getByLabelText('amount') as HTMLInputElement;
    // '100.0' differs as a string but coerces to the current 100.
    fireEvent.change(input, { target: { value: '100.0' } });
    fireEvent.blur(input);
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('an unchanged number blur authors nothing', () => {
    const { mocks } = draw();
    selectField('amount');
    fireEvent.blur(screen.getByLabelText('amount'));
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
    const area = screen.getByLabelText('memo') as HTMLTextAreaElement;
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
    const select = screen.getByLabelText('入荷状況') as HTMLSelectElement;
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
    const select = screen.getByLabelText('区切り種別') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['section', 'end']);
    expect(screen.queryByText(/params の値/)).toBeNull();
  });

  it('picking an option commits the VALUE, not the label', () => {
    const { mocks } = drawEnum({ status: 'backorder' });
    selectField('入荷状況');
    fireEvent.change(screen.getByLabelText('入荷状況'), { target: { value: 'arrived' } });
    expect(mocks.onParamsChange).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mocks.onParamsChange.mock.calls[0][0] as string);
    expect(written.status).toBe('arrived');
  });

  it('a same-value change commits nothing', () => {
    const { mocks } = drawEnum({ status: 'backorder' });
    selectField('入荷状況');
    fireEvent.change(screen.getByLabelText('入荷状況'), { target: { value: 'backorder' } });
    expect(mocks.onParamsChange).not.toHaveBeenCalled();
  });

  it('an out-of-enum current value stays visible, warned, and pickable-away-from', () => {
    const { mocks } = drawEnum({ status: 'canceld' });
    selectField('入荷状況');
    const select = screen.getByLabelText('入荷状況') as HTMLSelectElement;
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
    expect(screen.queryByLabelText('入荷状況')).toBeNull();
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
    const field = screen.getByLabelText('大きな集合');
    expect(field.tagName).toBe('TEXTAREA');
  });
});

describe('DataEditorView read-only sample', () => {
  it('shows values as text, no inputs, and the engineer hint', () => {
    draw({ sampleDataReadOnly: true });
    expect(screen.getByText(/エンジニアが管理/)).not.toBeNull();
    selectField('表示タイトル');
    expect(screen.queryByLabelText('表示タイトル')).toBeNull();
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

function openAdd() {
  fireEvent.click(screen.getByRole('button', { name: 'データ項目を追加' }));
  return screen.getByRole('form', { name: 'データ項目を追加' });
}

describe('DataEditorView add-item', () => {
  it('opens the form from its button and closes it on cancel, authoring nothing', () => {
    const { mocks } = draw();
    const form = openAdd();
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'memo' } });
    fireEvent.click(within(form).getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('form', { name: 'データ項目を追加' })).toBeNull();
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
    // Reopening starts from a clean draft.
    expect((within(openAdd()).getByLabelText('データ名') as HTMLInputElement).value).toBe('');
  });

  it('adds a fresh top-level field as ONE putValue op, closes, and selects it', () => {
    const { mocks, rerender, props } = draw();
    const form = openAdd();
    fireEvent.change(within(form).getByLabelText('表示ラベル'), { target: { value: 'メモ' } });
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'memo' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledTimes(1);
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'putValue',
      keys: ['properties', 'memo'],
      value: { type: 'string', title: 'メモ' },
    });
    expect(screen.queryByRole('form', { name: 'データ項目を追加' })).toBeNull();
    // Once the host folds the op in, the new item is the selection.
    rerender(
      <I18nProvider locale="ja">
        <DataEditorView
          {...props}
          definitions={`${DEFS}  memo:\n    type: string\n    title: メモ\n`}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'メモ' })).not.toBeNull();
  });

  it('disables 追加 until a data name is typed', () => {
    draw();
    const form = openAdd();
    expect((within(form).getByRole('button', { name: '追加' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('refuses a name the same place already holds, with a localized notice', () => {
    const { mocks } = draw();
    const form = openAdd();
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'title' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
    expect(
      within(form).getByText(
        'この追加先には、同じデータ名がすでにあります。別の名前にしてください。',
      ),
    ).not.toBeNull();
  });

  it('refuses an over-long, a dotted and an invisible-character name, each with its reason', () => {
    const { mocks } = draw();
    const form = openAdd();
    const cases: [string, string][] = [
      ['x'.repeat(200), 'データ名は 120 文字以内にしてください。'],
      ['a.b', 'データ名に「.」は使えません。'],
      ['a‮b', 'データ名に目に見えない文字が入っています。いったん消して、入力し直してください。'],
    ];
    for (const [name, message] of cases) {
      fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: name } });
      fireEvent.click(within(form).getByRole('button', { name: '追加' }));
      expect(within(form).getByText(message)).not.toBeNull();
    }
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
  });

  it('an IME kanji-confirm Enter never submits the add form', () => {
    const { mocks } = draw();
    const form = openAdd();
    const input = within(form).getByLabelText('データ名');
    fireEvent.change(input, { target: { value: 'memo' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
    // A plain Enter (composition settled) submits as usual.
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.submit(form);
    expect(mocks.onDefinitionEdit).toHaveBeenCalled();
  });

  it('adds a container kind picked from the seven', () => {
    const { mocks } = draw();
    const form = openAdd();
    const kinds = within(form).getByLabelText('型') as HTMLSelectElement;
    expect([...kinds.options].map((option) => option.text)).toEqual([
      'テキスト',
      '数値',
      '整数',
      'はい / いいえ',
      'グループ',
      '表（例：明細）',
      'リスト（例：タグ）',
    ]);
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'lines' } });
    fireEvent.change(kinds, { target: { value: 'table' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'putValue',
      keys: ['properties', 'lines'],
      value: { type: 'array', items: { type: 'object' } },
    });
  });

  it('starts at the selected table rows, and can add elsewhere', () => {
    const { mocks } = draw();
    selectField('明細');
    const form = openAdd();
    const target = within(form).getByLabelText('追加先') as HTMLSelectElement;
    expect(target.selectedOptions[0]?.text).toBe('明細 の各行');
    expect([...target.options].map((option) => option.text)).toEqual([
      'どのグループにも入れない',
      '明細 の各行',
    ]);
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'unit' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'putValue',
      keys: ['properties', 'items', 'items', 'properties', 'unit'],
      value: { type: 'string' },
    });
    const again = openAdd();
    fireEvent.change(within(again).getByLabelText('追加先'), { target: { value: '' } });
    fireEvent.change(within(again).getByLabelText('データ名'), { target: { value: 'unit' } });
    fireEvent.click(within(again).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'putValue',
      keys: ['properties', 'unit'],
      value: { type: 'string' },
    });
  });

  it('falls back to the top when the picked place disappears while the form is open', () => {
    const { mocks, rerender, props } = draw();
    selectField('明細');
    const form = openAdd();
    rerender(
      <I18nProvider locale="ja">
        <DataEditorView
          {...props}
          definitions={'type: object\nproperties:\n  title: { type: string }\n'}
        />
      </I18nProvider>,
    );
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'memo' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'putValue',
      keys: ['properties', 'memo'],
      value: { type: 'string' },
    });
  });

  it('adds into a blank start (no definitions yet) at the top', () => {
    const { mocks } = draw({ definitions: '' });
    const form = openAdd();
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'memo' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'putValue',
      keys: ['properties', 'memo'],
      value: { type: 'string' },
    });
  });

  it('is absent when definitions are not editable', () => {
    draw({ onDefinitionEdit: undefined });
    expect(screen.queryByRole('button', { name: 'データ項目を追加' })).toBeNull();
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

describe('DataEditorView — opening ON a field', () => {
  it('seeds the selection from initialSelection', () => {
    draw({ initialSelection: { group: '', key: 'title' } });
    // The detail pane is showing that field, not the pick-one-on-the-left hint.
    expect((screen.getByLabelText('表示ラベル') as HTMLInputElement).value).toBe('表示タイトル');
    expect(screen.queryByText(/左の一覧から項目を選ぶと/)).toBeNull();
  });

  it('reaches a field inside an array group', () => {
    draw({ initialSelection: { group: 'items', key: 'name' } });
    expect(screen.getByLabelText('表示ラベル')).not.toBeNull();
  });

  it('selects nothing for a target the definitions do not carry', () => {
    // A stale target (the field was renamed away between the click and the
    // open) must land on the no-selection surface, never throw.
    draw({ initialSelection: { group: '', key: 'gone' } });
    expect(screen.getByText(/左の一覧から項目を選ぶと/)).not.toBeNull();
  });

  it('leaves a __proto__ target inert', () => {
    draw({ initialSelection: { group: '__proto__', key: '__proto__' } });
    expect(screen.getByText(/左の一覧から項目を選ぶと/)).not.toBeNull();
  });

  it('opens with nothing selected when no target is given', () => {
    draw();
    expect(screen.getByText(/左の一覧から項目を選ぶと/)).not.toBeNull();
  });
});

describe('DataEditorView — the sample-value section', () => {
  it('says 「サンプル値」 exactly once, and names the input after the field', () => {
    draw();
    selectField('表示タイトル');
    // The heading titles the section; the widget under it says which FIELD it
    // belongs to (the array branch always did). Before this they were the same
    // string, stacked.
    expect(screen.getAllByText('サンプル値')).toHaveLength(1);
    expect(screen.getByLabelText('表示タイトル')).not.toBeNull();
  });

  it('explains what a sample value IS', () => {
    draw();
    selectField('表示タイトル');
    fireEvent.click(screen.getByRole('button', { name: 'サンプル値とは' }));
    expect(screen.getByText(/実際に発行するときに差し込まれる値ではありません/)).not.toBeNull();
  });

  it('keeps the heading and its explanation on a read-only host', () => {
    // The sentence is about what the DATA is, so it stays true where the
    // values are the engineer's and cannot be edited here.
    draw({ sampleDataReadOnly: true });
    selectField('表示タイトル');
    expect(screen.getAllByText('サンプル値')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'サンプル値とは' })).not.toBeNull();
  });

  it('still renders one input per row for an array field', () => {
    draw();
    // 明細 is the array GROUP; its one field is `name`.
    selectField('name');
    expect(screen.getAllByLabelText('name')).toHaveLength(2);
  });
});

const TREE_DEFS = `type: object
title: 請求書データ
version: "0.2.0"
required: [customer]
properties:
  customer:
    type: object
    title: 取引先
    description: 請求先の会社
    properties:
      name: { type: string, title: 宛名 }
      address:
        type: object
        properties:
          city: { type: string, title: 市区町村 }
  order:
    type: object
    properties:
      lines:
        type: array
        title: 注文行
        items:
          type: object
          required: [sku]
          properties:
            sku: { type: string, title: 品番 }
            tags:
              type: array
              items:
                type: object
                properties:
                  word: { type: string, title: 語 }
  notes:
    type: array
    title: 備考
    items: { type: string }
`;

const TREE_PARAMS = JSON.stringify({
  customer: { name: 'A社', address: { city: '大阪' } },
  order: { lines: [{ sku: 'X-1', tags: [{ word: 'w' }] }, { sku: 'X-2' }] },
});

function drawTree(over: Partial<DataEditorViewProps> = {}) {
  return draw({ definitions: TREE_DEFS, params: TREE_PARAMS, ...over });
}

function rowButton(label: string) {
  const nav = screen.getByRole('navigation');
  const found = within(nav)
    .getAllByRole('button')
    .find(
      (button) =>
        button.getAttribute('aria-current') !== null &&
        (button.textContent ?? '').startsWith(label),
    );
  if (found === undefined) {
    throw new Error(`no row ${label}`);
  }
  return found;
}

describe('DataEditorView tree', () => {
  it('lists the root first, then containers with their items indented under them', () => {
    drawTree();
    const nav = screen.getByRole('navigation');
    const rows = within(nav)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') !== null)
      .map((button) => button.textContent ?? '');
    expect(rows).toEqual([
      'データ全体の情報',
      expect.stringContaining('取引先'),
      expect.stringContaining('宛名'),
      expect.stringContaining('address'),
      expect.stringContaining('市区町村'),
      expect.stringContaining('order'),
      expect.stringContaining('注文行'),
      expect.stringContaining('品番'),
      expect.stringContaining('tags'),
      expect.stringContaining('語'),
      expect.stringContaining('備考'),
    ]);
  });

  it('shows the kind of a container, the required chip, and no usage for a group', () => {
    drawTree();
    expect(rowButton('取引先').textContent).toContain('グループ');
    expect(rowButton('取引先').textContent).toContain('必須');
    expect(rowButton('取引先').textContent).not.toContain('未使用');
    expect(rowButton('注文行').textContent).toContain('表');
    expect(rowButton('備考').textContent).toContain('リスト');
    expect(rowButton('備考').textContent).toContain('未使用');
    expect(rowButton('品番').textContent).toContain('必須');
  });

  it('selects a node two levels down', () => {
    drawTree();
    fireEvent.click(rowButton('市区町村'));
    expect(screen.getByRole('heading', { level: 2, name: '市区町村' })).not.toBeNull();
    // The header names the node's OWN data name — the same unit the add form
    // takes and refuses a 「.」 in; the tree above already shows where it sits.
    const header = screen.getByRole('heading', { level: 2, name: '市区町村' }).parentElement;
    expect(header?.textContent).toContain('データ名: city');
    expect(header?.textContent).not.toContain('customer.address.city');
    expect(rowButton('市区町村').getAttribute('aria-current')).toBe('true');
  });

  it('folds and unfolds a container with its own toggle, without changing the selection', () => {
    drawTree();
    fireEvent.click(rowButton('宛名'));
    const toggle = screen.getByRole('button', { name: '「取引先」の中の項目' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('市区町村')).toBeNull();
    // The selection stays on 宛名 (the detail heading), hidden row or not.
    expect(screen.getByRole('heading', { level: 2, name: '宛名' })).not.toBeNull();
    fireEvent.click(toggle);
    expect(rowButton('市区町村')).not.toBeNull();
  });

  it('opens a folded container when an item inside it becomes the selection', () => {
    const { rerender, props } = drawTree();
    fireEvent.click(rowButton('注文行'));
    fireEvent.click(screen.getByRole('button', { name: '「注文行」の中の項目' }));
    // The rail no longer shows the folded rows (the detail pane's 中の項目 links
    // to the same items, so scope the query to the rail).
    expect(within(screen.getByRole('navigation')).queryByText('品番')).toBeNull();
    const form = openAdd();
    fireEvent.change(within(form).getByLabelText('データ名'), { target: { value: 'qty' } });
    fireEvent.click(within(form).getByRole('button', { name: '追加' }));
    rerender(
      <I18nProvider locale="ja">
        <DataEditorView
          {...props}
          definitions={TREE_DEFS.replace(
            '            sku: { type: string, title: 品番 }\n',
            '            sku: { type: string, title: 品番 }\n            qty: { type: number }\n',
          )}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByRole('button', { name: '「注文行」の中の項目' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(rowButton('qty').getAttribute('aria-current')).toBe('true');
  });

  it('gives a list (nothing to open) no toggle', () => {
    drawTree();
    expect(screen.queryByRole('button', { name: '「備考」の中の項目' })).toBeNull();
  });

  it('shows a search hit even inside a folded container', () => {
    drawTree();
    fireEvent.click(screen.getByRole('button', { name: '「取引先」の中の項目' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '市区' } });
    expect(rowButton('市区町村')).not.toBeNull();
  });

  it('opens on a palette jump into a table nested in an object', () => {
    drawTree({ initialSelection: { group: 'order.lines', key: 'sku' } });
    expect(screen.getByRole('heading', { level: 2, name: '品番' })).not.toBeNull();
  });
});

describe('DataEditorView container and root detail', () => {
  it('edits a group label and description, and lists its items as links', () => {
    const { mocks } = drawTree();
    fireEvent.click(rowButton('取引先'));
    expect(screen.getByText('グループ', { selector: 'span.rounded-full' })).not.toBeNull();
    const label = screen.getByDisplayValue('取引先');
    fireEvent.blur(label, { target: { value: '請求先' } });
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'setScalar',
      keys: ['properties', 'customer', 'title'],
      value: '請求先',
    });
    fireEvent.blur(screen.getByDisplayValue('請求先の会社'), { target: { value: '' } });
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'removeKey',
      keys: ['properties', 'customer', 'description'],
    });
    expect(screen.getByText('中の項目（2）')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'address' }));
    expect(screen.getByRole('heading', { level: 2, name: 'address' })).not.toBeNull();
  });

  it('a container blur that changes nothing authors nothing', () => {
    const { mocks } = drawTree();
    fireEvent.click(rowButton('取引先'));
    fireEvent.blur(screen.getByDisplayValue('取引先'));
    expect(mocks.onDefinitionEdit).not.toHaveBeenCalled();
  });

  it('keeps the root row of an EMPTY dictionary editable', () => {
    const { mocks } = draw({ definitions: 'type: object\nproperties: {}\n' });
    expect(screen.getByText('データ項目はありません。')).not.toBeNull();
    fireEvent.click(rowButton('データ全体の情報'));
    fireEvent.blur(screen.getByLabelText('版（技術者向け）'), { target: { value: '0.1.0' } });
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'setScalar',
      keys: ['version'],
      value: '0.1.0',
    });
  });

  it('shows a list with no items section', () => {
    drawTree();
    fireEvent.click(rowButton('備考'));
    expect(screen.getByRole('heading', { level: 2, name: '備考' })).not.toBeNull();
    expect(screen.queryByText(/中の項目/)).toBeNull();
  });

  it('edits the root label, description and version', () => {
    const { mocks } = drawTree();
    fireEvent.click(rowButton('データ全体の情報'));
    expect(screen.getByRole('heading', { level: 2, name: 'データ全体の情報' })).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: '必須' })).toBeNull();
    fireEvent.blur(screen.getByDisplayValue('請求書データ'), { target: { value: '納品書データ' } });
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'setScalar',
      keys: ['title'],
      value: '納品書データ',
    });
    fireEvent.blur(screen.getByDisplayValue('0.2.0'), { target: { value: '0.3.0' } });
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'setScalar',
      keys: ['version'],
      value: '0.3.0',
    });
    expect(screen.getByText(/この定義の版です/)).not.toBeNull();
    fireEvent.blur(screen.getByLabelText('説明'), { target: { value: '請求書の項目' } });
    expect(mocks.onDefinitionEdit).toHaveBeenLastCalledWith({
      op: 'setScalar',
      keys: ['description'],
      value: '請求書の項目',
    });
  });

  it('renders container and root forms read-only when not editable', () => {
    drawTree({ onDefinitionEdit: undefined });
    fireEvent.click(rowButton('取引先'));
    expect((screen.getByDisplayValue('取引先') as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByRole('checkbox', { name: '必須' }) as HTMLInputElement).disabled).toBe(
      true,
    );
    fireEvent.click(rowButton('データ全体の情報'));
    expect((screen.getByDisplayValue('0.2.0') as HTMLInputElement).readOnly).toBe(true);
  });
});

describe('DataEditorView required', () => {
  it('ticks a field into its parent list and explains what required does', () => {
    const { mocks } = drawTree();
    fireEvent.click(rowButton('宛名'));
    // Inside a group the engine checks `required` only when the group is in the
    // data, so the hint names the group.
    expect(
      screen.getByText(
        '「取引先」がデータにあるとき、この項目が無いと診断に警告が出ます。印刷は止まりません。',
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '必須' }));
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({
      op: 'setStrings',
      keys: ['properties', 'customer', 'required'],
      values: ['name'],
    });
  });

  it('says a top-level item warns whenever it is missing, and a row field per row', () => {
    drawTree();
    fireEvent.click(rowButton('取引先'));
    expect(
      screen.getByText('データに無いと、診断に警告が出ます。印刷は止まりません。'),
    ).not.toBeNull();
    fireEvent.click(rowButton('品番'));
    expect(
      screen.getByText(
        '「注文行」の各行に、この項目が無いと診断に警告が出ます。印刷は止まりません。',
      ),
    ).not.toBeNull();
  });

  it('unticks a top-level container, removing the emptied root list', () => {
    const { mocks } = drawTree();
    fireEvent.click(rowButton('取引先'));
    const box = screen.getByRole('checkbox', { name: '必須' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(mocks.onDefinitionEdit).toHaveBeenCalledWith({ op: 'removeKey', keys: ['required'] });
  });
});

describe('DataEditorView sample placement through the tree', () => {
  it('edits the rows of a table nested in an object, by path', () => {
    const { mocks } = drawTree();
    fireEvent.click(rowButton('品番'));
    const inputs = screen.getAllByLabelText('品番');
    expect(inputs).toHaveLength(2);
    fireEvent.blur(inputs[1] as HTMLElement, { target: { value: 'X-9' } });
    const next = JSON.parse(mocks.onParamsChange.mock.calls[0][0]);
    expect(next.order.lines[1].sku).toBe('X-9');
    fireEvent.click(screen.getByText('行を追加'));
    expect(JSON.parse(mocks.onParamsChange.mock.calls[1][0]).order.lines).toHaveLength(3);
    fireEvent.click(screen.getAllByText('削除')[0] as HTMLElement);
    expect(JSON.parse(mocks.onParamsChange.mock.calls[2][0]).order.lines).toHaveLength(1);
  });

  it('adds the FIRST row to an empty table inside a group, creating its data', () => {
    const { mocks } = drawTree({ params: JSON.stringify({ customer: { name: 'A社' } }) });
    fireEvent.click(rowButton('品番'));
    expect(screen.getByText('サンプルデータはありません。')).not.toBeNull();
    fireEvent.click(screen.getByText('行を追加'));
    expect(JSON.parse(mocks.onParamsChange.mock.calls[0][0]).order).toEqual({ lines: [{}] });
  });

  it('shows the no-rows note for a table nested in another table rows', () => {
    drawTree();
    fireEvent.click(rowButton('語'));
    expect(screen.getByText('サンプルデータはありません。')).not.toBeNull();
    expect(screen.queryByLabelText('語')).toBeNull();
  });
});

describe('DataEditorView bands', () => {
  it('shows the project-scope band above the pane and not in the rail', () => {
    drawTree({ definitionsProjectScoped: true });
    const nav = screen.getByRole('navigation');
    expect(within(nav).queryByText(/プロジェクト全体で共有/)).toBeNull();
    expect(screen.getByText(/プロジェクト全体で共有/)).not.toBeNull();
  });

  it('says the definitions were inferred in workshop mode', () => {
    drawTree({ definitionsInferred: true });
    expect(screen.getByText(/サンプルデータから推測した定義です/)).not.toBeNull();
  });

  it('lets the wider (shared) band win if both ever apply', () => {
    drawTree({ definitionsProjectScoped: true, definitionsInferred: true });
    expect(screen.getByText(/プロジェクト全体で共有/)).not.toBeNull();
    expect(screen.queryByText(/サンプルデータから推測した定義です/)).toBeNull();
  });

  it('shows no band for an engineer file edited in the standalone app', () => {
    drawTree();
    expect(screen.queryByText(/プロジェクト全体で共有/)).toBeNull();
    expect(screen.queryByText(/サンプルデータから推測した定義です/)).toBeNull();
  });
});

describe('DataEditorView add-item targets on a nested tree', () => {
  it('offers the top and every group and table rows, each named by its path from the top', () => {
    drawTree();
    const form = openAdd();
    const target = within(form).getByLabelText('追加先') as HTMLSelectElement;
    expect([...target.options].map((option) => option.text)).toEqual([
      'どのグループにも入れない',
      '取引先',
      '取引先 › address',
      'order',
      'order › 注文行 の各行',
      'order › 注文行 の各行 › tags の各行',
    ]);
  });
});
