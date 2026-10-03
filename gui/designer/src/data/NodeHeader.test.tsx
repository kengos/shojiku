// The detail header's usage chip and rename / delete, through the data-item
// editor: the chip for 0 / N places and the list it opens; the rename form per
// arm (plain, project-scoped, a typed refusal, a refusal only the plan sees) and
// the selection following the renamed node; delete immediate for an unused node
// in an unshared file, confirmed otherwise (used; shared + unused), the parent
// selected after it and the rail's status line; and no controls at all on a
// host that did not arm them.

import type { Op } from '@shojiku/designer-core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { DataEditorView, type DataEditorViewProps } from './DataEditorView';
import type { DefsNode } from './defsTree';
import type { RestructureRefusal } from './renamePlan';

const DEFS = `type: object
properties:
  lines:
    type: array
    title: 明細
    items:
      type: object
      properties:
        sku: { type: string, title: 品番 }
  total: { type: number, title: 合計 }
  memo: { type: string, title: メモ }
  customer:
    type: object
    title: 取引先
    properties:
      name: { type: string }
`;

const TEMPLATE = `document:
  title: "{customer.name}"
sections:
  body:
    type: flow
    items:
      - { type: text, text: "合計 {total}" }
      - { type: text, data: { key: total } }
`;

function draw(over: Partial<DataEditorViewProps> = {}) {
  const rename = vi.fn<(node: DefsNode, name: string) => RestructureRefusal | null>(() => null);
  const remove = vi.fn<(node: DefsNode) => RestructureRefusal | null>(() => null);
  const props: DataEditorViewProps = {
    definitions: DEFS,
    params: '{}',
    templateText: TEMPLATE,
    onDefinitionEdit: vi.fn<(op: Op) => boolean | undefined>(() => true),
    onParamsChange: vi.fn(),
    onClose: vi.fn(),
    restructure: { rename, remove },
    ...over,
  };
  render(
    <I18nProvider locale="ja">
      <DataEditorView {...props} />
    </I18nProvider>,
  );
  return { rename, remove };
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

const heading = () => screen.getByRole('heading', { level: 2, name: /合計|メモ|取引先/ });

describe('usage chip', () => {
  it('says how many places use the node and opens the list naming each', () => {
    draw();
    select('合計');
    const chip = screen.getByRole('button', { name: 'このテンプレートで 2 か所' });
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('region', { name: 'このテンプレートでの使用箇所' });
    expect(within(list).getByText('テキスト「合計 {total}」')).not.toBeNull();
    expect(within(list).getByText('文中の差し込み')).not.toBeNull();
    expect(within(list).getByText('値')).not.toBeNull();
    fireEvent.click(chip);
    expect(screen.queryByRole('region', { name: 'このテンプレートでの使用箇所' })).toBeNull();
  });

  it('says an unused node is unused, with nothing to open', () => {
    draw();
    select('メモ');
    expect(screen.getByText('このテンプレートでは未使用')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /か所/ })).toBeNull();
  });

  it('counts a group by its children, the document block included', () => {
    draw();
    select('取引先');
    fireEvent.click(screen.getByRole('button', { name: 'このテンプレートで 1 か所' }));
    expect(screen.getByText('文書情報')).not.toBeNull();
  });
});

describe('rename', () => {
  it('starts on the current name with the button off, and shows the change and what it rewrites', () => {
    const { rename } = draw();
    select('合計');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    const form = screen.getByRole('form', { name: 'データ名を変更' });
    const input = within(form).getByLabelText('新しいデータ名') as HTMLInputElement;
    expect(input.value).toBe('total');
    const submit = within(form).getByRole('button', {
      name: '変更する',
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'grand' } });
    expect(submit.disabled).toBe(false);
    expect(within(form).getByText('total → grand')).not.toBeNull();
    expect(
      within(form).getByText('このテンプレートの 2 か所も新しいデータ名に書き換えます。'),
    ).not.toBeNull();
    expect(
      within(form).getByText(/1 回で、テンプレートとサンプルデータもまとめて戻ります/),
    ).not.toBeNull();
    expect(within(form).queryByText('ほかのテンプレートは書き換わりません。')).toBeNull();
    fireEvent.submit(form);
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ name: 'total' }), 'grand');
    expect(screen.queryByRole('form', { name: 'データ名を変更' })).toBeNull();
  });

  it('refuses a typed name as it is typed (a `{key}` cannot spell it)', () => {
    draw();
    select('合計');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    const form = screen.getByRole('form', { name: 'データ名を変更' });
    fireEvent.change(within(form).getByLabelText('新しいデータ名'), { target: { value: '総額' } });
    expect(within(form).getByText(/文中の差し込みで使えるのは/)).not.toBeNull();
    expect(
      (within(form).getByRole('button', { name: '変更する' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // The "will rewrite" box is withheld while a refusal says it will not.
    expect(within(form).queryByText(/新しいデータ名に書き換えます/)).toBeNull();
  });

  it('shows a refusal only the plan sees, and keeps the form open', () => {
    const { rename } = draw();
    rename.mockReturnValue('too_large');
    select('合計');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    const form = screen.getByRole('form', { name: 'データ名を変更' });
    fireEvent.change(within(form).getByLabelText('新しいデータ名'), { target: { value: 'grand' } });
    fireEvent.submit(form);
    expect(within(form).getByText(/この画面で扱える大きさを超えます/)).not.toBeNull();
  });

  it('adds the shared-definitions warning for a project-scoped file', () => {
    draw({ definitionsProjectScoped: true });
    select('合計');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    expect(screen.getByText('ほかのテンプレートは書き換わりません。')).not.toBeNull();
    expect(screen.getByText(/total を使っている場所には、データが入らなくなり/)).not.toBeNull();
  });
});

describe('delete', () => {
  it('deletes an unused node in an unshared file at once, selecting its parent and saying so', () => {
    const { remove } = draw();
    select('メモ');
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe(
      '「メモ」を削除しました。「定義の編集を元に戻す」で戻せます。',
    );
    // The deleted node's parent is the root here.
    expect(screen.getByRole('heading', { level: 2, name: 'データ全体の情報' })).not.toBeNull();
  });

  it('confirms a used node, naming the places and the outcome', () => {
    const { remove } = draw();
    select('合計');
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(remove).not.toHaveBeenCalled();
    const confirm = screen.getByRole('region', { name: '削除' });
    expect(within(confirm).getByText('「合計」を削除しますか？')).not.toBeNull();
    expect(
      within(confirm).getByText('このテンプレートでは、次の 2 か所がこのデータを使っています。'),
    ).not.toBeNull();
    expect(within(confirm).getByText(/定義されていません/)).not.toBeNull();
    fireEvent.click(within(confirm).getByRole('button', { name: 'キャンセル' }));
    expect(screen.queryByRole('region', { name: '削除' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    fireEvent.click(
      within(screen.getByRole('region', { name: '削除' })).getByRole('button', {
        name: '「合計」を削除する',
      }),
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('always confirms in a project-scoped file, saying other templates cannot be checked', () => {
    const { remove } = draw({ definitionsProjectScoped: true });
    select('メモ');
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(remove).not.toHaveBeenCalled();
    expect(
      screen.getByText(/ほかのテンプレートで使われているかは、ここでは分かりません/),
    ).not.toBeNull();
  });

  it('names a container with what is inside it', () => {
    draw();
    select('取引先');
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByText('「取引先」と中の 1 項目を削除しますか？')).not.toBeNull();
  });

  it('reports a refused delete in the rail and keeps the selection', () => {
    const { remove } = draw();
    remove.mockReturnValue('edit_cap');
    select('メモ');
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('status').textContent).toMatch(/定義の編集は 256 件までで/);
    expect(heading().textContent).toBe('メモ');
  });
});

describe('arming', () => {
  it('shows no rename / delete without the host’s restructure', () => {
    draw({ restructure: undefined });
    select('合計');
    expect(screen.queryByRole('button', { name: 'データ名を変更' })).toBeNull();
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull();
  });

  it('shows no rename / delete on the root', () => {
    draw();
    select('データ全体の情報');
    expect(screen.queryByRole('button', { name: '削除' })).toBeNull();
    expect(screen.queryByText('このテンプレートでは未使用')).toBeNull();
  });

  it('shows no rename / delete when the definitions are not editable', () => {
    draw({ onDefinitionEdit: undefined });
    select('合計');
    expect(screen.queryByRole('button', { name: 'データ名を変更' })).toBeNull();
  });

  it('says the edit-list cap in the rail when a plain edit is refused', () => {
    draw({ onDefinitionEdit: vi.fn(() => false) });
    select('合計');
    const label = screen.getByLabelText('表示ラベル');
    fireEvent.change(label, { target: { value: '総計' } });
    fireEvent.blur(label);
    expect(screen.getByRole('status').textContent).toMatch(/この編集はできませんでした/);
  });

  it('keeps a node selected under its old name after an undone rename', () => {
    draw({ canUndoDefinition: true, onUndoDefinition: () => ['properties', 'total'] });
    fireEvent.click(screen.getByRole('button', { name: '定義の編集を元に戻す' }));
    expect(heading().textContent).toBe('合計');
  });

  it('says a refused definitions undo in the rail', () => {
    draw({ canUndoDefinition: true, onUndoDefinition: () => false });
    fireEvent.click(screen.getByRole('button', { name: '定義の編集を元に戻す' }));
    expect(screen.getByRole('status').textContent).toMatch(/戻せませんでした/);
  });
});

describe('the remaining arms', () => {
  it('deletes a row field and selects its table', () => {
    draw();
    select('品番');
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('heading', { level: 2, name: '明細' })).not.toBeNull();
  });

  it('says N=0 renames only the samples, and an emptied name refuses quietly', () => {
    draw();
    select('メモ');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    const form = screen.getByRole('form', { name: 'データ名を変更' });
    expect(within(form).getByText(/1 回で、サンプルデータもまとめて戻ります/)).not.toBeNull();
    expect(within(form).queryByText(/テンプレートとサンプルデータ/)).toBeNull();
    fireEvent.change(within(form).getByLabelText('新しいデータ名'), { target: { value: '  ' } });
    expect(within(form).queryByRole('status')).toBeNull();
    expect(
      (within(form).getByRole('button', { name: '変更する' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('does not submit on an IME-confirming Enter', () => {
    const { rename } = draw();
    select('メモ');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    const input = screen.getByLabelText('新しいデータ名');
    fireEvent.change(input, { target: { value: 'note' } });
    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    input.dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(true);
    const plain = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(rename).not.toHaveBeenCalled();
  });

  it('says the count is a floor when the walk stopped, and confirms a delete it cannot prove safe', () => {
    const many = `sections:\n  body:\n    items:\n${'      - { type: text, text: x }\n'.repeat(4100)}`;
    const { remove } = draw({ templateText: many });
    select('メモ');
    expect(screen.getByText(/最後まで調べられませんでした/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: '削除' })).not.toBeNull();
  });

  it('reads an unreadable template as no usage at all', () => {
    draw({ templateText: ': [' });
    select('合計');
    expect(screen.getByText('このテンプレートでは未使用')).not.toBeNull();
  });

  it('refuses an add at the edit-list cap, saying so in the rail', () => {
    draw({ onDefinitionEdit: vi.fn(() => false) });
    fireEvent.click(screen.getByRole('button', { name: 'データ項目を追加' }));
    fireEvent.change(screen.getByLabelText('データ名'), { target: { value: 'fresh' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    expect(screen.getByRole('status').textContent).toMatch(/定義の編集は 256 件までで/);
    // The form stays open with what was typed.
    expect((screen.getByLabelText('データ名') as HTMLInputElement).value).toBe('fresh');
  });
});

describe('a host that manages its own sample data', () => {
  it('says the sample data is not changed, in the rename and the delete', () => {
    draw({ sampleDataReadOnly: true });
    select('合計');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    expect(
      screen.getByText(
        /書き換わりません。「定義の編集を元に戻す」1 回で、テンプレートもまとめて戻ります/,
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByText(/書き換わりません。「定義の編集を元に戻す」で戻せます/)).not.toBeNull();
  });

  it('says so for an unused item’s rename too', () => {
    draw({ sampleDataReadOnly: true });
    select('メモ');
    fireEvent.click(screen.getByRole('button', { name: 'データ名を変更' }));
    expect(
      screen.getByText('サンプルデータは技術者が管理しているため、書き換わりません。'),
    ).not.toBeNull();
  });
});

describe('the undo control’s description', () => {
  it('carries what the next undo takes back', () => {
    draw({
      canUndoDefinition: true,
      onUndoDefinition: () => true,
      undoDefinitionHint: '元に戻す: total → grand のデータ名の変更',
    });
    const button = screen.getByRole('button', { name: '定義の編集を元に戻す' });
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('元に戻す: total → grand のデータ名の変更');
  });
});
