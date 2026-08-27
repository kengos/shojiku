import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { FormatPicker } from './FormatPicker';
import type { FormatOption } from './formatModel';

const OPTIONS: readonly FormatOption[] = [
  { spelling: 'tax', labelKey: undefined, samples: [], origin: 'registry', dropsTime: false },
  {
    spelling: 'symbol',
    labelKey: 'format.label.symbol',
    samples: ['¥1,234,568'],
    origin: 'builtin',
    dropsTime: false,
  },
  {
    spelling: 'name',
    labelKey: 'format.label.name',
    samples: ['1,234,568 JPY'],
    origin: 'builtin',
    dropsTime: false,
  },
];

function draw(value: string, options: readonly FormatOption[], onCommit = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <FormatPicker label="Format" value={value} options={options} onCommit={onCommit} />
    </I18nProvider>,
  );
  return onCommit;
}

describe('FormatPicker', () => {
  it('renders the current format in a free-entry input, popover closed', () => {
    draw('currency', OPTIONS);
    expect((screen.getByLabelText('Format') as HTMLInputElement).value).toBe('currency');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows an authored spelling the picker no longer offers', () => {
    // The offer list is type-filtered, so a legally authored name can sit
    // outside it — a registry entry left on a binding whose field was later
    // re-typed, or one typed by hand. The input is free text and shows it
    // verbatim: narrowing what is OFFERED must never rewrite what is AUTHORED.
    draw('stamp', OPTIONS.slice(1));
    expect((screen.getByLabelText('Format') as HTMLInputElement).value).toBe('stamp');
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(screen.getByRole('menu').textContent).not.toContain('stamp');
  });

  it('opens a popover with localized label, wire spelling, and sample per builtin row', () => {
    draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('Currency symbol');
    expect(menu.textContent).toContain('symbol');
    expect(menu.textContent).toContain('¥1,234,568');
    // A registry name (no labelKey) shows its wire spelling as the label.
    expect(menu.textContent).toContain('tax');
  });

  it('marks a row that drops the time, and only that row', () => {
    // D2a, at the surface. `compact` on a datetime binding is honoured and
    // warns about nothing — the time just stops being shown — so the picker is
    // the last place a reader can learn it. The mark has to be ON THE ROW: a
    // banner over the whole list would say it about the rows that keep the
    // time too, which reads the same as saying nothing.
    const DATED: readonly FormatOption[] = [
      {
        spelling: 'compact',
        labelKey: 'format.variant.compact',
        samples: ['2026/11/03'],
        origin: 'pack',
        dropsTime: true,
      },
      {
        spelling: 'wareki',
        labelKey: 'format.variant.wareki',
        samples: ['令和8年11月3日 14:05'],
        origin: 'pack',
        dropsTime: false,
      },
    ];
    draw('', DATED);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(screen.getByRole('menuitem', { name: /Compact/ }).textContent).toContain('No time');
    expect(screen.getByRole('menuitem', { name: /Japanese era/ }).textContent).not.toContain(
      'No time',
    );
  });

  it('commits a picked spelling and closes the popover', () => {
    const onCommit = draw('', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /symbol/ }));
    expect(onCommit).toHaveBeenCalledWith('symbol');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not re-commit when the picked spelling equals the current value', () => {
    const onCommit = draw('symbol', OPTIONS);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Currency symbol/ }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps free entry working (commit a typed spelling on change)', () => {
    const onCommit = draw('', OPTIONS);
    fireEvent.blur(screen.getByLabelText('Format'), { target: { value: 'wareki' } });
    expect(onCommit).toHaveBeenCalledWith('wareki');
  });

  it('does not commit an unchanged typed value on blur', () => {
    const onCommit = draw('currency', OPTIONS);
    fireEvent.blur(screen.getByLabelText('Format'), { target: { value: 'currency' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows the empty state when no formats are offered', () => {
    draw('', []);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a format' }));
    expect(screen.getByText('No formats to choose from.')).toBeTruthy();
  });
});
