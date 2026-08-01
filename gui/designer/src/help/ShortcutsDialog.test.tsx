import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { ShortcutsDialog } from './ShortcutsDialog';

function draw(open: boolean, onClose = vi.fn()) {
  return render(
    <I18nProvider locale="en">
      <ShortcutsDialog open={open} onClose={onClose} />
    </I18nProvider>,
  );
}

describe('ShortcutsDialog', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing while closed', () => {
    draw(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every shortcut with its description when open', () => {
    draw(true);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
    expect(screen.getByText('Clear selection')).toBeTruthy();
  });

  it('renders Ctrl chords off macOS', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    draw(true);
    expect(screen.getByText('Ctrl+Z')).toBeTruthy();
  });

  it('renders ⌘ chords on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
    draw(true);
    expect(screen.getByText('⌘Z')).toBeTruthy();
  });

  it('fires onClose from the close button', () => {
    const onClose = vi.fn();
    draw(true, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
