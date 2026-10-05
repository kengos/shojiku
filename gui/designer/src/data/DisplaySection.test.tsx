// 「表示」 of a field, driven through the whole data-item editor over a LIVE
// definitions harness (every op the host receives is applied, so the pane
// re-reads what was written): which controls each field type gets, the
// currency / places / unit entries with their refusals and notes, the default
// display format picker over the engine's catalog (samples in the field's OWN
// currency, an authored value kept), the no-op blurs, and the host's edit cap.

import type { Op } from '@shojiku/designer-core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FormatCatalog } from '../engine/types';
import { I18nProvider } from '../i18n/context';
import { FORMAT_CATALOG } from '../testkit/formatCatalog';
import { draw as draw2, makeTransport, openDataEditor, selectDataField } from '../testkit/harness';
import { DataEditorView, type DataEditorViewProps } from './DataEditorView';
import { applyDefinitionOps } from './definitionsEdit';

const DEFS = `type: object
properties:
  total: { type: number, format: currency, title: 合計 }
  usd: { type: number, format: currency, title: 外貨, currency: USD, precision: 0, displayFormat: symbol }
  rate: { type: number, format: percentage, title: 率 }
  qty: { type: integer, format: quantity, title: 数量 }
  weight: { type: number, format: quantity, title: 重さ, unit: kg }
  count: { type: number, title: 件数 }
  issued: { type: string, format: date, title: 発行日 }
  stamp: { type: string, format: date-time, title: 時刻 }
  memo: { type: string, title: メモ }
  flag: { type: boolean, title: 済 }
  odd: { type: string, title: 変, displayFormat: accounting }
  # a comment the edits must keep
  kept: { type: number, format: currency, title: 残す, currency: JPY }
`;

/** The catalog as if the document's currency were USD. */
const USD: FormatCatalog = {
  ...FORMAT_CATALOG,
  types: FORMAT_CATALOG.types.map((entry) =>
    entry.fieldType === 'currency'
      ? {
          ...entry,
          variants: entry.variants.map((variant) => ({
            ...variant,
            samples: [`${variant.spelling}:$1,234,567.89`],
          })),
        }
      : entry,
  ),
};

interface HarnessProps {
  readonly defs?: string;
  readonly over?: Partial<DataEditorViewProps>;
  readonly ops: Op[];
  readonly accept?: boolean;
}

function Harness({ defs = DEFS, over, ops, accept = true }: HarnessProps) {
  const [text, setText] = useState(defs);
  return (
    <I18nProvider locale="ja">
      <DataEditorView
        definitions={text}
        params="{}"
        templateText="sections: { body: { type: flow, items: [] } }"
        onDefinitionEdit={(op) => {
          if (!accept) {
            return false;
          }
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

const atCurrency = vi.fn(async (code: string) => (code === 'USD' ? USD : null));
const formats = { catalog: FORMAT_CATALOG, atCurrency };

function draw(props: Partial<HarnessProps> = {}) {
  const ops: Op[] = [];
  render(<Harness ops={ops} over={{ formatCatalog: formats, ...props.over }} {...props} />);
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

const display = () =>
  screen.getByRole('heading', { level: 3, name: '表示' }).closest('section') as HTMLElement;
/** A suggested entry (currency, unit) is a combobox; a plain one a textbox. */
const SUGGESTED = ['通貨', '単位'];
const role = (name: string) => (SUGGESTED.includes(name) ? 'combobox' : 'textbox');
const box = (name: string) => within(display()).getByRole(role(name), { name });
const queryBox = (name: string) => within(display()).queryByRole(role(name), { name });
const blur = (name: string, value: string) => fireEvent.blur(box(name), { target: { value } });
const toggle = () => within(display()).queryByRole('button', { name: '既定の表示形式を選ぶ' });
const formatsList = () => within(display()).queryByRole('button', { name: /^表示形式の絞り込み/ });

describe('which display controls a field gets', () => {
  it('a currency field: currency, places, default format, blank text, formats list', () => {
    draw();
    select('合計');
    expect(box('通貨')).toBeTruthy();
    expect(box('小数の桁数')).toBeTruthy();
    expect(toggle()).not.toBeNull();
    expect(box('空欄のときに出す文字')).toBeTruthy();
    expect(formatsList()).not.toBeNull();
    expect(queryBox('単位')).toBeNull();
  });

  it('a percentage: places and the fixed rendering, no currency, no picker, no list', () => {
    draw();
    select('率');
    expect(box('小数の桁数')).toHaveProperty('placeholder', '標準');
    expect(queryBox('通貨')).toBeNull();
    expect(toggle()).toBeNull();
    expect(within(display()).getByText('この種類の項目では、既定は選べません')).toBeTruthy();
    expect(within(display()).getByText('12.34%')).toBeTruthy();
    expect(formatsList()).toBeNull();
  });

  it('a quantity: the unit with the engine sample of the default, and the fixed rendering', () => {
    draw();
    select('数量');
    expect(box('単位')).toHaveProperty('placeholder', 'item');
    expect(
      within(display()).getByText(
        '空欄なら定義に書きません。既定の単位 item（1点 / 12,345点）になります。',
      ),
    ).toBeTruthy();
    expect(queryBox('小数の桁数')).toBeNull();
    expect(toggle()).toBeNull();
  });

  it('a plain number: only the fixed rendering and the blank text', () => {
    draw();
    select('件数');
    expect(queryBox('小数の桁数')).toBeNull();
    expect(within(display()).getByText('12,345,678.9')).toBeTruthy();
    expect(formatsList()).toBeNull();
  });

  it('a date and a date-time: the picker over their own variants, and the list', () => {
    draw();
    select('発行日');
    expect(toggle()).not.toBeNull();
    expect(formatsList()).not.toBeNull();
    select('時刻');
    fireEvent.click(toggle() as HTMLElement);
    expect(screen.getByRole('menuitem', { name: /wareki-compact/ })).toBeTruthy();
  });

  it('text and yes / no: the blank text alone', () => {
    draw();
    for (const label of ['メモ', '済']) {
      select(label);
      expect(toggle()).toBeNull();
      expect(formatsList()).toBeNull();
      expect(queryBox('通貨')).toBeNull();
      expect(box('空欄のときに出す文字')).toBeTruthy();
    }
  });
});

describe('currency, places and unit', () => {
  it('writes a typed currency code as is, and clears it', () => {
    const ops = draw();
    select('合計');
    blur('通貨', 'eur');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'total', 'currency'], value: 'eur' },
    ]);
    blur('通貨', '');
    expect(ops.at(-1)).toEqual({ op: 'removeKey', keys: ['properties', 'total', 'currency'] });
  });

  it('suggests the codes the packs carry, and the hint names the document section', () => {
    draw();
    select('合計');
    const list = document.getElementById(box('通貨').getAttribute('list') ?? '') as HTMLElement;
    expect(list.querySelectorAll('option')).toHaveLength(25);
    expect(
      within(display()).getByText(
        '空欄なら定義に書きません。文書の「ロケール・通貨」の通貨（未設定ならロケールの既定）になります。',
      ),
    ).toBeTruthy();
  });

  it('refuses decimal places past 20 beside the entry, and writes 20', () => {
    const ops = draw();
    select('合計');
    blur('小数の桁数', '21');
    expect(ops).toEqual([]);
    const refusal = screen.getByText('20 以下の数を入れてください。');
    expect(box('小数の桁数').getAttribute('aria-describedby')).toBe(refusal.id);
    blur('小数の桁数', '1.5');
    expect(screen.getByText('整数を入れてください。')).toBeTruthy();
    blur('小数の桁数', '20');
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'total', 'precision'], value: 20 },
    ]);
  });

  it('says when an unknown unit prints verbatim, and not for item or empty', () => {
    draw();
    select('重さ');
    expect(within(display()).getByText(/「kg」がそのまま単位として印字されます/)).toBeTruthy();
    select('数量');
    expect(within(display()).queryByText(/がそのまま単位として印字されます/)).toBeNull();
    blur('単位', 'item');
    expect(within(display()).queryByText(/がそのまま単位として印字されます/)).toBeNull();
  });

  it('authors nothing on a blur that changes nothing', () => {
    const ops = draw();
    select('外貨');
    blur('通貨', 'USD');
    blur('小数の桁数', '0');
    blur('空欄のときに出す文字', '');
    expect(ops).toEqual([]);
  });

  it('leaves the document unchanged when the host refuses the edit, and the rail says why', () => {
    const ops = draw({ accept: false });
    select('合計');
    blur('通貨', 'USD');
    expect(ops).toEqual([]);
    expect(box('通貨')).toHaveProperty('value', '');
    expect(screen.getByText(/定義の編集は 256 件までで、上限に達したため/)).toBeTruthy();
  });

  it('keeps every untouched line, comment included', () => {
    let latest = '';
    const ops: Op[] = [];
    render(
      <Harness
        ops={ops}
        over={{
          formatCatalog: formats,
          onDefinitionEdit: (op) => {
            ops.push(op);
            latest = applyDefinitionOps(DEFS, [op]);
            return true;
          },
        }}
      />,
    );
    select('残す');
    blur('小数の桁数', '0');
    expect(latest).toBe(DEFS.replace('currency: JPY }', 'currency: JPY, precision: 0 }'));
  });
});

describe('the default display format', () => {
  it('lists the engine variants with the wire spelling and sample, and picks ONE op', () => {
    const ops = draw();
    select('合計');
    expect(within(display()).getByText('文書の表示形式に従う')).toBeTruthy();
    fireEvent.click(toggle() as HTMLElement);
    const symbol = screen.getByRole('menuitem', { name: /記号付き/ });
    expect(symbol.textContent).toContain('symbol');
    expect(symbol.textContent).toContain('¥1,234,568');
    fireEvent.click(symbol);
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'total', 'displayFormat'], value: 'symbol' },
    ]);
    expect(within(display()).getByText('¥1,234,568')).toBeTruthy();
    fireEvent.click(toggle() as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: '文書の表示形式に従う' }));
    expect(ops.at(-1)).toEqual({ op: 'removeKey', keys: ['properties', 'total', 'displayFormat'] });
  });

  it('samples a field with its own currency in THAT currency, and says the places are standard', async () => {
    draw();
    select('外貨');
    await waitFor(() => expect(within(display()).getByText('symbol:$1,234,567.89')).toBeTruthy());
    expect(atCurrency).toHaveBeenCalledWith('USD');
    expect(
      within(display()).getByText('見本の桁数は標準のままです。この項目は 0 桁で印字されます。'),
    ).toBeTruthy();
  });

  it('says nothing about the places while no sample is on screen', () => {
    draw();
    select('合計');
    blur('小数の桁数', '2');
    expect(within(display()).queryByText(/見本の桁数は標準のままです/)).toBeNull();
  });

  it('states the printed places only for a whole number, capped where the engine clamps', async () => {
    draw({
      defs: `type: object
properties:
  big: { type: number, format: currency, title: 大, precision: 25, displayFormat: symbol }
  word: { type: number, format: currency, title: 語, precision: two, displayFormat: symbol }
`,
    });
    select('大');
    expect(
      within(display()).getByText('見本の桁数は標準のままです。この項目は 20 桁で印字されます。'),
    ).toBeTruthy();
    select('語');
    expect(within(display()).queryByText(/見本の桁数は標準のままです/)).toBeNull();
  });

  it('drops the samples when the catalog for a new field currency cannot be had', async () => {
    const ops = draw();
    select('外貨');
    await waitFor(() => expect(within(display()).getByText('symbol:$1,234,567.89')).toBeTruthy());
    blur('通貨', 'XXX');
    expect(ops).toHaveLength(1);
    await act(async () => {});
    expect(atCurrency).toHaveBeenCalledWith('XXX');
    expect(within(display()).queryByText(/1,234,56/)).toBeNull();
  });

  it('shows a document named format by its own name once picked', () => {
    const ops = draw();
    select('発行日');
    fireEvent.click(toggle() as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: /stamp/ }));
    expect(ops).toEqual([
      { op: 'setScalar', keys: ['properties', 'issued', 'displayFormat'], value: 'stamp' },
    ]);
    expect(within(display()).getByText('stamp')).toBeTruthy();
    expect(within(display()).getByText('2026.11.03')).toBeTruthy();
  });

  it('keeps an authored value outside the offered set, selected, until another is picked', () => {
    const ops = draw();
    select('変');
    expect(within(display()).getByText('accounting')).toBeTruthy();
    fireEvent.click(toggle() as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: /accounting/ }));
    expect(ops).toEqual([]);
    fireEvent.click(toggle() as HTMLElement);
    fireEvent.click(screen.getByRole('menuitem', { name: '文書の表示形式に従う' }));
    expect(ops).toEqual([{ op: 'removeKey', keys: ['properties', 'odd', 'displayFormat'] }]);
  });

  it('offers no variants and no samples without a catalog, and no picker on a read-only host', () => {
    draw({ over: { formatCatalog: undefined } });
    select('合計');
    expect(toggle()).toBeNull();
    select('外貨');
    expect(within(display()).getByText('symbol')).toBeTruthy();
    expect(toggle()).not.toBeNull();
  });

  it('offers no formats list on a date without a catalog to name its variants', () => {
    draw({ over: { formatCatalog: undefined } });
    select('発行日');
    expect(formatsList()).toBeNull();
  });

  it('clips a hand-written unit and default format to a readable length', () => {
    const long = 'x'.repeat(400);
    draw({
      defs: `type: object\nproperties:\n  w: { type: number, format: quantity, title: 長, unit: ${long}, displayFormat: ${long} }\n`,
    });
    select('長');
    const note = within(display()).getByText(/がそのまま単位として印字されます/);
    expect(note.textContent).toContain(`${'x'.repeat(120)}…`);
    expect(note.textContent).not.toContain('x'.repeat(121));
  });

  it('shows the authored value without a picker when definitions are read-only', () => {
    render(
      <I18nProvider locale="ja">
        <DataEditorView
          definitions={DEFS}
          params="{}"
          templateText=""
          formatCatalog={formats}
          onParamsChange={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    select('外貨');
    expect(toggle()).toBeNull();
    expect(box('通貨')).toHaveProperty('readOnly', true);
  });

  it('keeps the default row in the engine order and origin even without its own entry', () => {
    const thin: FormatCatalog = {
      types: [
        {
          fieldType: 'date',
          fixed: false,
          variants: [{ spelling: 'wareki', origin: 'pack', samples: ['令和'], dropsTime: false }],
        },
      ],
      probes: [],
    };
    draw({ over: { formatCatalog: { catalog: thin, atCurrency } } });
    select('発行日');
    fireEvent.click(toggle() as HTMLElement);
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(items.at(-1)).toContain('default');
  });
});

describe('the catalog the Designer hands the data-item editor', () => {
  const DEFINITIONS =
    'type: object\nproperties:\n  total: { type: number, format: currency, title: Total, displayFormat: symbol }\n';

  it('threads the engine catalog through, so the samples are the engine’s', async () => {
    const formatCatalog = vi.fn(async () => FORMAT_CATALOG);
    draw2(makeTransport({ formatCatalog }), { definitions: DEFINITIONS, params: '{"total":1}' });
    openDataEditor();
    selectDataField('Total');
    await waitFor(() => expect(screen.getByText('¥1,234,568')).toBeTruthy());
  });

  it('shows no sample on an engine without the catalog', () => {
    draw2(makeTransport(), { definitions: DEFINITIONS, params: '{"total":1}' });
    openDataEditor();
    selectDataField('Total');
    expect(screen.getByText('symbol')).toBeTruthy();
    expect(screen.queryByText('¥1,234,568')).toBeNull();
  });
});
