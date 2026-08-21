import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { MAX_LCS_LINES } from './diffModel';
import { SaveReviewModal, type SaveReviewModalProps } from './SaveReviewModal';

function draw(props: Partial<SaveReviewModalProps> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const merged: SaveReviewModalProps = {
    open: true,
    mode: 'save',
    baseline: 'a\nb\nc',
    current: 'a\nB\nc',
    onConfirm,
    onClose,
    ...props,
  };
  render(
    <I18nProvider locale="en">
      <SaveReviewModal {...merged} />
    </I18nProvider>,
  );
  return { onConfirm, onClose };
}

describe('SaveReviewModal', () => {
  it('renders the save title, summary and line diff', () => {
    draw();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Review before saving')).toBeTruthy();
    expect(within(dialog).getByText('1 changed')).toBeTruthy();
    // The changed line shows on both sides of the diff.
    expect(within(dialog).getByText('B')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('renders the export title and confirm label in export mode', () => {
    draw({ mode: 'export' });
    expect(screen.getByText('Review before exporting')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('renders the copilot title, baseline caption, note and confirm label', () => {
    draw({ mode: 'copilot', note: 'Changed one line.' });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Review AI proposal')).toBeTruthy();
    expect(within(dialog).getByText('Baseline: current document')).toBeTruthy();
    expect(within(dialog).getByText('Changed one line.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  it('renders no note row when the note is absent', () => {
    draw({ mode: 'copilot' });
    expect(screen.queryByText('Changed one line.')).toBeNull();
  });

  it('shows the no-change state when the texts are identical', () => {
    draw({ baseline: 'a\nb', current: 'a\nb' });
    expect(screen.getByText('No changes')).toBeTruthy();
    // No diff list rendered.
    expect(screen.queryByText('1 changed')).toBeNull();
  });

  it('shows a notice instead of the diff for a huge change (truncated)', () => {
    const current = Array.from({ length: MAX_LCS_LINES + 3 }, (_, i) => `l${i}`).join('\n');
    draw({ baseline: '', current });
    expect(
      screen.getByText('The change is large; showing only part of the line diff.'),
    ).toBeTruthy();
  });

  it('confirm dispatches onConfirm, never onClose', () => {
    const { onConfirm, onClose } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel / close / Escape run onClose and NEVER onConfirm', () => {
    const cancel = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel.onClose).toHaveBeenCalled();
    expect(cancel.onConfirm).not.toHaveBeenCalled();

    const close = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close.onClose).toHaveBeenCalled();
    expect(close.onConfirm).not.toHaveBeenCalled();

    const esc = draw();
    fireEvent.keyDown(screen.getAllByRole('dialog')[0] as HTMLElement, {
      key: 'Escape',
      code: 'Escape',
    });
    expect(esc.onConfirm).not.toHaveBeenCalled();
  });

  it('renders document-derived diff lines as escaped text, never live HTML', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <I18nProvider locale="en">
        <SaveReviewModal
          open
          mode="save"
          baseline="a"
          current={`a\n${hostile}`}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    // The text appears verbatim; no <img> element was minted from it.
    expect(screen.getByText(hostile)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });
});

// The RENDERED counterpart to `ui/actionConvention.test.ts`: that gate reads the
// SOURCE and proves each footer names exactly one primary, which is a claim
// about the JSX. This proves the prop actually reaches the DOM on THIS dialog's
// confirming action — Material 3's emphasis hierarchy is only real once the
// element carries it. `data-variant` is the documented hook; never assert the
// utility classes.
describe('SaveReviewModal — emphasis (Material 3: one primary per screen)', () => {
  it('paints its confirming action as the primary, and its dismissal as a peer', () => {
    draw();
    expect(screen.getByRole('button', { name: 'Save' }).dataset.variant).toBe('primary');
    expect(screen.getByRole('button', { name: 'Cancel' }).dataset.variant).toBe('default');
  });
});
