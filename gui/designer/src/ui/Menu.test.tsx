import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, type MenuGroup } from './Menu';

const GROUPS: readonly MenuGroup[] = [
  {
    heading: '要素',
    entries: [
      { id: 'text', label: 'テキスト' },
      { id: 'image', label: '画像', disabled: true },
    ],
  },
  {
    entries: [{ id: 'iterable', label: '繰り返し' }],
  },
];

describe('Menu', () => {
  it('renders a closed trigger with the label', () => {
    render(<Menu label="挿入" groups={GROUPS} onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: '挿入' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click, showing group headings and entries', () => {
    render(<Menu label="挿入" groups={GROUPS} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '挿入' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByText('要素')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'テキスト' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '繰り返し' })).toBeTruthy();
  });

  it('hands the picked entry id up and closes', async () => {
    const onSelect = vi.fn();
    render(<Menu label="挿入" groups={GROUPS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '挿入' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'テキスト' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('text');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('marks a disabled entry and does not select it', () => {
    const onSelect = vi.fn();
    render(<Menu label="挿入" groups={GROUPS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '挿入' }));
    const disabled = screen.getByRole('menuitem', { name: '画像' });
    expect(disabled.getAttribute('data-disabled')).not.toBeNull();
    fireEvent.click(disabled);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a document-derived label as inert text, never HTML', () => {
    render(
      <Menu
        label="挿入"
        groups={[{ entries: [{ id: 'x', label: '<img src=x onerror=alert(1)>' }] }]}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '挿入' }));
    const menu = screen.getByRole('menu');
    expect(menu.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(menu.querySelector('img')).toBeNull();
  });

  const CHOICES: readonly MenuGroup[] = [
    {
      entries: [
        { id: 'auto', label: '自動' },
        { id: 'light', label: 'ライト' },
      ],
    },
  ];

  it('exposes the icon trigger by its accessible label and opens the menu', () => {
    render(
      <Menu label="テーマ" trigger={<svg aria-hidden />} groups={CHOICES} onSelect={vi.fn()} />,
    );
    // The label is the accessible NAME (no visible text on an icon trigger).
    const trigger = screen.getByRole('button', { name: 'テーマ' });
    expect(trigger.textContent).toBe('');
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: '自動' })).toBeTruthy();
  });

  it('gives the icon trigger a decorative bubble instead of a native title', () => {
    const { container } = render(
      <Menu label="テーマ" trigger={<svg aria-hidden />} groups={CHOICES} onSelect={vi.fn()} />,
    );
    const trigger = screen.getByRole('button', { name: 'テーマ' });
    expect(trigger.getAttribute('title')).toBeNull();
    expect(trigger.getAttribute('aria-label')).toBe('テーマ');
    const tip = container.querySelector('[data-sj-tip]');
    expect(tip?.textContent).toBe('テーマ');
    expect(tip?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the TEXT trigger no bubble — its label is already visible', () => {
    const { container } = render(<Menu label="挿入" groups={GROUPS} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: '挿入' }).getAttribute('title')).toBeNull();
    expect(container.querySelector('[data-sj-tip]')).toBeNull();
  });

  it('dispatches the picked id from an icon-trigger menu', () => {
    const onSelect = vi.fn();
    render(
      <Menu label="テーマ" trigger={<svg aria-hidden />} groups={CHOICES} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'テーマ' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'ライト' }));
    expect(onSelect).toHaveBeenCalledWith('light');
  });

  it('marks exactly the checked entry with a check icon', () => {
    render(
      <Menu
        label="テーマ"
        trigger={<svg aria-hidden />}
        groups={CHOICES}
        checkedId="light"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'テーマ' }));
    const checked = screen.getByRole('menuitem', { name: 'ライト' });
    const unchecked = screen.getByRole('menuitem', { name: '自動' });
    // The checkmark is an svg inside the checked entry only, and the current
    // choice is exposed to assistive tech via aria-current on EXACTLY one item.
    expect(checked.querySelector('svg')).not.toBeNull();
    expect(unchecked.querySelector('svg')).toBeNull();
    expect(checked.getAttribute('aria-current')).toBe('true');
    expect(unchecked.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('menu').querySelectorAll('[aria-current="true"]').length).toBe(1);
  });
});

describe('Menu with a value beside the icon', () => {
  const icon = <span data-testid="glyph" />;

  // The header's language control: the visible text is the current VALUE (a
  // noun), so the accessible name has to keep naming the ACTION. `gui:e2e`
  // finds this control by that name, and an aria-label wins over content.
  it('shows the value while `label` stays the accessible name', () => {
    render(
      <Menu
        label="Language"
        trigger={icon}
        triggerText="日本語"
        groups={GROUPS}
        onSelect={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(trigger.textContent).toContain('日本語');
    expect(screen.getByTestId('glyph')).toBeTruthy();
  });

  it('renders the glyph alone when no value is given', () => {
    render(<Menu label="Theme" trigger={icon} groups={GROUPS} onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Theme' });
    expect(trigger.textContent).toBe('');
    expect(screen.getByTestId('glyph')).toBeTruthy();
  });

  // A stored preference can name a language this build does not know, and a
  // display label has no length bound of its own.
  it('bounds the value it shows', () => {
    render(
      <Menu
        label="Language"
        trigger={icon}
        triggerText={'x'.repeat(400)}
        groups={GROUPS}
        onSelect={vi.fn()}
      />,
    );
    const value = screen.getByRole('button', { name: 'Language' }).querySelector('span.truncate');
    expect(value).not.toBeNull();
    expect(value?.className).toContain('max-w-44');
  });
});
