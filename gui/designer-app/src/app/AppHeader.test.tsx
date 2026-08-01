import { I18nProvider } from '@shojiku/designer';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_CATALOG } from '../i18n/appCatalog';
import type { ThemePreference } from '../theme/scheme';
import { AppHeader, type HeaderDoc } from './AppHeader';

function renderHeader(node: ReactNode) {
  const wrap = (n: ReactNode) => (
    <I18nProvider locale="en-US" catalog={APP_CATALOG}>
      {n}
    </I18nProvider>
  );
  const result = render(wrap(node));
  return { ...result, rerender: (n: ReactNode) => result.rerender(wrap(n)) };
}

const noop = vi.fn();

function header(props: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  return (
    <AppHeader
      doc={null}
      engineLoad={{ kind: 'ready' }}
      locale="en-US"
      onLocaleChange={noop}
      themePref="auto"
      onThemeChange={noop}
      {...props}
    />
  );
}

describe('AppHeader document title', () => {
  it('shows the brand alone as the title when no document is open', () => {
    const { container } = renderHeader(header({ doc: null }));
    const brands = screen.getAllByText('Shojiku Designer');
    // Exactly one occurrence: the title itself, with no small brand sub-line.
    expect(brands.length).toBe(1);
    expect(container.querySelector('output')).toBeNull();
  });

  it('shows the document name as the title over the small brand line', () => {
    renderHeader(header({ doc: { name: 'Invoice' } }));
    expect(screen.getByText('Invoice')).toBeTruthy();
    // The brand drops to the small sub-line beneath the document name.
    expect(screen.getByText('Shojiku Designer')).toBeTruthy();
  });

  it('never doubles the brand for a name-less document report', () => {
    // A report carrying only a save status (no name) falls back to the brand
    // as the title — the sub-line must not repeat it.
    renderHeader(header({ doc: { saveStatus: 'saving' } }));
    expect(screen.getAllByText('Shojiku Designer').length).toBe(1);
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('shows the save indicator only when a save status is reported', () => {
    const { rerender } = renderHeader(header({ doc: { name: 'Invoice' } }));
    expect(screen.queryByText('Saving…')).toBeNull();
    rerender(header({ doc: { name: 'Invoice', saveStatus: 'saving' } }));
    expect(screen.getByText('Saving…')).toBeTruthy();
    rerender(header({ doc: { name: 'Invoice', saveStatus: 'saved' } }));
    expect(screen.getByText('Saved.')).toBeTruthy();
  });
});

describe('AppHeader editable title', () => {
  const RENAME = 'Rename document';

  it('renders a static title (no rename control) when the doc is not renamable', () => {
    renderHeader(header({ doc: { name: 'Invoice' } }));
    // No onRename → the title is plain text, not a rename button.
    expect(screen.queryByRole('button', { name: 'Invoice' })).toBeNull();
    expect(screen.getByText('Invoice')).toBeTruthy();
  });

  it('keeps the document name as the accessible name; the rename hint is the description', () => {
    renderHeader(header({ doc: { name: 'Invoice', onRename: vi.fn() } }));
    // Label-in-name: a voice-control user activates the control by saying the
    // visible title; the rename affordance rides `title`, never an aria-label
    // that would replace the name.
    const button = screen.getByRole('button', { name: 'Invoice' });
    expect(button.getAttribute('title')).toBe(RENAME);
    expect(button.getAttribute('aria-label')).toBeNull();
  });

  it('swaps the title for a focused, seeded input on click', () => {
    renderHeader(header({ doc: { name: 'Invoice', onRename: vi.fn() } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME }) as HTMLInputElement;
    expect(input.value).toBe('Invoice');
    expect(document.activeElement).toBe(input);
  });

  it('commits a renamed value on Enter and closes the editor', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME });
    fireEvent.change(input, { target: { value: '  Monthly invoice  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Trimmed, committed once; the editor closes back to a button.
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith('Monthly invoice');
    expect(screen.queryByRole('textbox', { name: RENAME })).toBeNull();
  });

  it('commits on blur (clicking away)', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME });
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith('Renamed');
  });

  it('cancels on Escape without committing, restoring the title', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME });
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    // Back to the button showing the original (prop-controlled) name.
    expect(screen.getByRole('button', { name: 'Invoice' }).textContent).toBe('Invoice');
  });

  it('does not commit an empty / whitespace-only name (reverts)', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: RENAME })).toBeNull();
  });

  it('does not commit a value identical to the current name', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    // Commit the seeded value unchanged.
    fireEvent.keyDown(screen.getByRole('textbox', { name: RENAME }), { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('clips an over-long name to the cap before committing', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME }) as HTMLInputElement;
    // maxLength is the UI affordance; the slice is the authoritative guard.
    expect(input.maxLength).toBe(120);
    fireEvent.change(input, { target: { value: 'z'.repeat(300) } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((onRename.mock.calls[0][0] as string).length).toBe(120);
  });

  it('ignores Enter fired mid-IME-composition (kanji conversion, not commit)', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME });
    fireEvent.change(input, { target: { value: '請求書' } });
    // Enter while composing confirms the IME candidate, not the rename.
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: RENAME })).toBeTruthy();
  });

  it('ignores keys other than Enter and Escape while editing', () => {
    const onRename = vi.fn();
    renderHeader(header({ doc: { name: 'Invoice', onRename } }));
    fireEvent.click(screen.getByRole('button', { name: 'Invoice' }));
    const input = screen.getByRole('textbox', { name: RENAME });
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    // Still editing, nothing committed or cancelled.
    expect(screen.getByRole('textbox', { name: RENAME })).toBeTruthy();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('keeps the save indicator beside an editable title', () => {
    renderHeader(header({ doc: { name: 'Invoice', saveStatus: 'saving', onRename: vi.fn() } }));
    expect(screen.getByRole('button', { name: 'Invoice' })).toBeTruthy();
    expect(screen.getByText('Saving…')).toBeTruthy();
  });

  it('renders a hostile renamable name as inert text, never HTML', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = renderHeader(header({ doc: { name: hostile, onRename: vi.fn() } }));
    expect(screen.getByRole('button', { name: hostile }).textContent).toBe(hostile);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('AppHeader theme control', () => {
  it('offers the three theme states with the current one checked', () => {
    renderHeader(header({ themePref: 'dark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    expect(screen.getByRole('menuitem', { name: 'Auto' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Light' })).toBeTruthy();
    const dark = screen.getByRole('menuitem', { name: 'Dark' });
    // The current preference (dark) carries the checkmark; the others do not.
    expect(dark.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Light' }).querySelector('svg')).toBeNull();
  });

  it('reports the picked theme preference, auto included (all three reachable)', () => {
    const onThemeChange = vi.fn();
    renderHeader(header({ themePref: 'dark', onThemeChange }));
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dark' }));
    expect(onThemeChange).toHaveBeenCalledWith('dark');
    // Auto stays a first-class, selectable state (never dropped to a binary).
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Auto' }));
    expect(onThemeChange).toHaveBeenLastCalledWith('auto');
  });

  it.each<[ThemePreference, string]>([
    ['light', 'lucide-sun'],
    ['dark', 'lucide-moon'],
    ['auto', 'lucide-monitor'],
  ])('shows the %s trigger glyph', (pref, iconClass) => {
    renderHeader(header({ themePref: pref }));
    const trigger = screen.getByRole('button', { name: 'Theme' });
    expect(trigger.querySelector(`.${iconClass}`)).not.toBeNull();
  });
});

describe('AppHeader language control', () => {
  it('lists the locales with the current one checked and reports a pick', () => {
    const onLocaleChange = vi.fn();
    renderHeader(header({ locale: 'en-US', onLocaleChange }));
    fireEvent.click(screen.getByRole('button', { name: 'Language' }));
    const current = screen.getByRole('menuitem', { name: 'English (US)' });
    expect(current.querySelector('svg')).not.toBeNull();
    const ja = screen.getByRole('menuitem', { name: '日本語' });
    expect(ja.querySelector('svg')).toBeNull();
    fireEvent.click(ja);
    expect(onLocaleChange).toHaveBeenCalledWith('ja-JP');
  });
});

describe('AppHeader security', () => {
  it('renders a hostile document name as inert text, never HTML', () => {
    const hostile: HeaderDoc = { name: '<img src=x onerror=alert(1)>{{customer.name}}' };
    const { container } = renderHeader(header({ doc: hostile }));
    expect(screen.getByText('<img src=x onerror=alert(1)>{{customer.name}}')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});
