import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { FormatPicker } from './FormatPicker';
import type { FormatOption } from './formatModel';

const OPTIONS: readonly FormatOption[] = [
  { spelling: 'tax', labelKey: undefined, samples: [], origin: 'registry' },
  {
    spelling: 'symbol',
    labelKey: 'format.label.symbol',
    samples: ['¥1,234,568'],
    origin: 'builtin',
  },
  {
    spelling: 'name',
    labelKey: 'format.label.name',
    samples: ['1,234,568 JPY'],
    origin: 'builtin',
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
