// The usage list names each place the way the layer tree does — kind, label,
// the column or header group it sits in — once per owner and role, with the
// role words a panel already uses read from that panel's own keys.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { type DataRef, NO_SHADOW } from './refs/types';
import { UsageList } from './UsageList';

function ref(over: Partial<Omit<DataRef, 'form'>>): DataRef {
  return {
    owner: { path: 'sections.body.items[0]', type: 'text', label: '合計' },
    detail: null,
    path: 'sections.body.items[0]',
    keys: ['data', 'key'],
    frame: [],
    spelled: 'total',
    carrier: 'value',
    source: false,
    shadow: NO_SHADOW,
    ...over,
    form: 'whole',
  };
}

function rows(refs: readonly DataRef[]): string[] {
  render(
    <I18nProvider locale="ja">
      <UsageList refs={refs} />
    </I18nProvider>,
  );
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

describe('UsageList', () => {
  it('lists one row per owner and role', () => {
    expect(rows([ref({}), ref({ keys: ['text'] }), ref({ carrier: 'inline' })])).toEqual([
      'テキスト「合計」値',
      'テキスト「合計」文中の差し込み',
    ]);
  });

  it('names a typeless or unlabelled owner by its kind, and the column it sits in', () => {
    expect(
      rows([
        ref({ owner: { path: 'a', type: '', label: null } }),
        ref({
          owner: { path: 'b', type: 'table', label: '明細表' },
          detail: '品名',
          carrier: 'column',
        }),
        ref({ owner: { path: 'document', type: 'document', label: null }, carrier: 'document' }),
      ]),
    ).toEqual(['項目値', '表「明細表」の「品名」列の値', '文書情報文書情報への差し込み']);
  });

  it('names the drawing condition of an ellipse / checkbox and a show condition as their panels do', () => {
    expect(
      rows([
        ref({ owner: { path: 'e', type: 'ellipse', label: null }, carrier: 'ellipse' }),
        ref({ owner: { path: 'c', type: 'checkbox', label: null }, carrier: 'checkbox' }),
        ref({ carrier: 'visible' }),
      ]),
    ).toEqual([
      '楕円描くタイミング',
      'チェックボックスチェックの有無',
      'テキスト「合計」表示する条件',
    ]);
  });
});
