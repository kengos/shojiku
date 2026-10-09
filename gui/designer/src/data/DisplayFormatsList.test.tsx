// 「この項目で使える表示形式」 driven through the whole data-item editor over a
// LIVE definitions harness: closed at first, the hint per type, add / edit / ×
// / ▲▼ / grip drag as ONE op each, the refusals, the read-only note, and the
// controls a read-only host does not get.

import type { Op } from '@shojiku/designer-core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { FORMAT_CATALOG } from '../testkit/formatCatalog';
import { DataEditorView } from './DataEditorView';
import { applyDefinitionOps } from './definitionsEdit';

const DEFS = `type: object
properties:
  issued:
    type: string
    format: date
    title: 発行日
    displayFormats:
      - { id: long, label: 長い形式 }
      - { id: wareki }
  total: { type: number, format: currency, title: 合計 }
  bad: { type: string, format: date, title: 壊れ, displayFormats: [ long ] }
  plain: { type: number, title: 件数, displayFormats: [ { id: symbol } ] }
  memo: { type: string, title: メモ, displayFormats: [ { id: x } ] }
`;
/** A hand-written list past the writable bound (127 unlabelled rows) — its own
 * fixture, so the other cases do not parse it on every read. */
const HUGE = `type: object
properties:
  huge: { type: string, format: date, title: 巨大, displayFormats: [ ${Array.from({ length: 200 }, (_, i) => `{ id: v${i} }`).join(', ')} ] }
`;
const KEYS = ['properties', 'issued', 'displayFormats'];
const formats = { catalog: FORMAT_CATALOG, atCurrency: vi.fn(async () => null) };

function Harness({
  ops,
  editable = true,
  defs = DEFS,
}: {
  readonly ops: Op[];
  readonly editable?: boolean;
  readonly defs?: string;
}) {
  const [text, setText] = useState(defs);
  return (
    <I18nProvider locale="ja">
      <DataEditorView
        definitions={text}
        params="{}"
        templateText=""
        formatCatalog={formats}
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

function draw(editable = true, defs = DEFS) {
  const ops: Op[] = [];
  render(<Harness ops={ops} editable={editable} defs={defs} />);
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

const disclosure = () => screen.getByRole('button', { name: /^表示形式の絞り込み/ });
/** The list's body (opened first when closed). */
const body = () => {
  if (disclosure().getAttribute('aria-expanded') === 'false') {
    fireEvent.click(disclosure());
  }
  return document.getElementById(disclosure().getAttribute('aria-controls') ?? '') as HTMLElement;
};
const open = () => within(body());
/** The id entries suggest spellings, so they are comboboxes. */
const entry = (name: string) =>
  open().getByRole(name.endsWith('呼び出し名') ? 'combobox' : 'textbox', { name });
const blur = (name: string, value: string) => fireEvent.blur(entry(name), { target: { value } });

describe('the declared display formats', () => {
  it('starts closed with its count, even when formats are authored', () => {
    draw();
    select('発行日');
    expect(disclosure().getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(disclosure().getAttribute('aria-controls') ?? '')).toBeNull();
    expect(screen.getByText('表示形式の絞り込み（2 件）')).toBeTruthy();
  });

  it('says what the list narrows, naming the money formats only on a currency field', () => {
    draw();
    select('発行日');
    const hint = open().getByText(/この一覧にも文書の「名前付き書式」にもない形式/);
    // An out-of-list pick is an ERROR that stops printing, and the placement
    // picker lists the declared formats first.
    expect(hint.textContent).toContain('診断でエラーになり、直すまで文書を印刷できません');
    expect(hint.textContent).toContain('この一覧が先頭に並び');
    select('合計');
    expect(
      open().getByText(/金額の 3 つの形式（既定、記号付き、通貨名付き）でもない/),
    ).toBeTruthy();
    expect(screen.getByText('表示形式の絞り込み（なし）')).toBeTruthy();
  });

  it('names the two amount formats on a plain number that declares a list', () => {
    draw();
    select('件数');
    expect(
      open().getByText(/金額として出す 2 つの形式（記号付き、通貨名付き）でもない/),
    ).toBeTruthy();
  });

  it('offers a declared id in the default display format menu, as written and first', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(screen.getByRole('button', { name: '既定の表示形式を選ぶ' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(items[1]).toContain('long');
    fireEvent.click(screen.getAllByRole('menuitem')[1]);
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'issued', 'displayFormat'], value: 'long' },
    ]);
  });

  it('adds a row as ONE op, writing no name when none was given, and suggests the spellings', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(open().getByRole('button', { name: '表示形式を追加' }));
    const id = entry('呼び出し名');
    const list = document.getElementById(id.getAttribute('list') ?? '') as HTMLElement;
    expect([...list.querySelectorAll('option')].map((o) => o.getAttribute('value'))).toEqual([
      'stamp',
      'wareki',
      'default',
    ]);
    fireEvent.change(id, { target: { value: 'stamp' } });
    fireEvent.keyDown(id, { key: 'Enter' });
    expect(ops).toEqual([
      {
        op: 'putValue',
        keys: KEYS,
        value: [{ id: 'long', label: '長い形式' }, { id: 'wareki' }, { id: 'stamp' }],
      },
    ]);
    expect(id).toHaveProperty('value', '');
  });

  it('refuses a duplicate or empty id in the draft, with the reason', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(open().getByRole('button', { name: '表示形式を追加' }));
    fireEvent.change(entry('呼び出し名'), {
      target: { value: 'long' },
    });
    fireEvent.click(open().getByRole('button', { name: '追加' }));
    expect(open().getByText('この呼び出し名はもう一覧にあります。')).toBeTruthy();
    fireEvent.change(entry('呼び出し名'), {
      target: { value: '' },
    });
    fireEvent.click(open().getByRole('button', { name: '追加' }));
    expect(open().getByText('呼び出し名を入れてください。')).toBeTruthy();
    expect(ops).toEqual([]);
  });

  it('edits an id and a name, removes a row, and removing the last drops the key', () => {
    const ops = draw();
    select('発行日');
    blur('「wareki」の呼び出し名', 'compact');
    blur('「long」の表示名', '');
    expect(ops).toEqual([
      { op: 'putValue', keys: KEYS, value: [{ id: 'long', label: '長い形式' }, { id: 'compact' }] },
      { op: 'putValue', keys: KEYS, value: [{ id: 'long' }, { id: 'compact' }] },
    ]);
    fireEvent.click(open().getByRole('button', { name: '表示形式「compact」を削除' }));
    fireEvent.click(open().getByRole('button', { name: '表示形式「long」を削除' }));
    expect(ops.at(-1)).toEqual({ op: 'removeKey', keys: KEYS });
  });

  it('moves a row with the buttons, and the focus follows it', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(open().getByRole('button', { name: '表示形式「long」を下へ移動' }));
    expect(ops).toEqual([
      { op: 'putValue', keys: KEYS, value: [{ id: 'wareki' }, { id: 'long', label: '長い形式' }] },
    ]);
    expect(document.activeElement).toBe(
      open().getByRole('button', { name: '表示形式「long」を上へ移動' }),
    );
  });

  it('does not add while an IME composition is open', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(open().getByRole('button', { name: '表示形式を追加' }));
    fireEvent.change(entry('呼び出し名'), { target: { value: 'stamp' } });
    fireEvent.keyDown(entry('呼び出し名'), { key: 'Enter', isComposing: true });
    expect(ops).toEqual([]);
  });

  it('paints the line BEFORE the row a drag would land above', () => {
    const ops = draw();
    select('発行日');
    open();
    const grip = (index: number) => body().querySelectorAll('[data-grip]')[index] as HTMLElement;
    const list = grip(1).closest('ul') as HTMLElement;
    [...list.children].forEach((li, index) => {
      li.getBoundingClientRect = () => ({ top: index * 40, height: 40 }) as DOMRect;
    });
    const pointer = (type: string, init: PointerEventInit) =>
      act(() => {
        grip(1).dispatchEvent(
          new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, ...init }),
        );
      });
    pointer('pointerdown', { clientY: 50 });
    pointer('pointermove', { clientY: 5 });
    expect(list.children[0].querySelector('[data-drop="before"]')).not.toBeNull();
    pointer('pointerup', { clientY: 5 });
    expect(ops.at(-1)).toMatchObject({ value: [{ id: 'wareki' }, { id: 'long' }] });
  });

  it('moves a row up with its button', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(open().getByRole('button', { name: '表示形式「wareki」を上へ移動' }));
    expect(ops).toEqual([
      { op: 'putValue', keys: KEYS, value: [{ id: 'wareki' }, { id: 'long', label: '長い形式' }] },
    ]);
  });

  it('adds a row with its name', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(open().getByRole('button', { name: '表示形式を追加' }));
    fireEvent.change(entry('呼び出し名'), { target: { value: 'stamp' } });
    const name = open().getByRole('textbox', { name: '表示名' });
    fireEvent.change(name, { target: { value: '刻印' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(ops.at(-1)).toMatchObject({
      value: [{ id: 'long' }, { id: 'wareki' }, { id: 'stamp', label: '刻印' }],
    });
  });

  it('drags a row through the shared machine as ONE op, from a touch-none grip', () => {
    const ops = draw();
    select('発行日');
    open();
    const grip = (index: number) => body().querySelectorAll('[data-grip]')[index] as HTMLElement;
    expect(grip(0).className).toContain('touch-none');
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
    pointer('pointermove', { clientY: 75 });
    expect(list.querySelector('[data-drop="after"]')).not.toBeNull();
    pointer('pointerup', { clientY: 75 });
    expect(ops).toEqual([
      { op: 'putValue', keys: KEYS, value: [{ id: 'wareki' }, { id: 'long', label: '長い形式' }] },
    ]);
  });

  it('shows a list it cannot write back as a note, with no controls', () => {
    draw();
    select('壊れ');
    expect(
      open().getByText('この一覧は、定義ファイルに直接書かれた形のため、ここでは変更できません。'),
    ).toBeTruthy();
    expect(open().queryByRole('button', { name: '表示形式を追加' })).toBeNull();
  });

  it('shows a hostile, too-long list as a note, rendering none of its rows', () => {
    draw(true, HUGE);
    select('巨大');
    expect(screen.getByText('表示形式の絞り込み（200 件）')).toBeTruthy();
    expect(
      open().getByText(
        /この一覧は長すぎて、ここでは編集できません（表示名ありで 85 件、表示名なしで 127 件まで）/,
      ),
    ).toBeTruthy();
    expect(body().querySelectorAll('li')).toHaveLength(0);
  });

  it('still shows an authored list on a type that offers none, so it can be cleared', () => {
    const ops = draw();
    select('メモ');
    fireEvent.click(open().getByRole('button', { name: '表示形式「x」を削除' }));
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 'memo', 'displayFormats'] }]);
  });

  it('gives a read-only host no add, remove, move or grip, and hides an empty list', () => {
    draw(false);
    select('発行日');
    expect(open().queryByRole('button', { name: '表示形式を追加' })).toBeNull();
    expect(open().queryByRole('button', { name: /を削除$/ })).toBeNull();
    expect(body().querySelector('[data-grip]')).toBeNull();
    select('合計');
    expect(screen.queryByText(/^表示形式の絞り込み/)).toBeNull();
  });
});
