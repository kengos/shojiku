import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { GlossaryDialog } from './GlossaryDialog';

function draw(open: boolean, onClose = vi.fn()) {
  return render(
    <I18nProvider locale="en">
      <GlossaryDialog open={open} onClose={onClose} />
    </I18nProvider>,
  );
}

describe('GlossaryDialog', () => {
  it('renders nothing while closed', () => {
    draw(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists each term and definition when open', () => {
    draw(true);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Data field')).toBeTruthy();
    expect(screen.getByText('Style')).toBeTruthy();
  });

  it('fires onClose from the close button', () => {
    const onClose = vi.fn();
    draw(true, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
