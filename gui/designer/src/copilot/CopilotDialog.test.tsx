import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { CopilotDialog, type CopilotRunOutcome } from './CopilotDialog';

function draw(onRun: (prompt: string) => Promise<CopilotRunOutcome>, onClose = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <CopilotDialog onClose={onClose} onRun={onRun} />
    </I18nProvider>,
  );
  return onClose;
}

const promptBox = () => screen.getByLabelText('What should change?');
const runButton = () => screen.getByRole('button', { name: 'Propose edits' }) as HTMLButtonElement;

describe('CopilotDialog', () => {
  it('disables the run button until a non-blank prompt exists', () => {
    draw(vi.fn(async () => ({ ok: true }) as CopilotRunOutcome));
    expect(runButton().disabled).toBe(true);
    fireEvent.change(promptBox(), { target: { value: '   ' } });
    expect(runButton().disabled).toBe(true);
    fireEvent.change(promptBox(), { target: { value: 'two columns' } });
    expect(runButton().disabled).toBe(false);
  });

  it('runs the TRIMMED prompt and shows the busy state while in flight', async () => {
    let release: (value: CopilotRunOutcome) => void = () => {};
    const onRun = vi.fn(
      (_prompt: string) =>
        new Promise<CopilotRunOutcome>((resolve) => {
          release = resolve;
        }),
    );
    draw(onRun);
    fireEvent.change(promptBox(), { target: { value: '  two columns  ' } });
    fireEvent.click(runButton());
    expect(onRun).toHaveBeenCalledWith('two columns');
    expect(screen.getByRole('button', { name: 'Asking…' })).toBeDefined();
    expect((promptBox() as HTMLTextAreaElement).disabled).toBe(true);
    // The keyboard path re-guards while in flight — no double request.
    fireEvent.keyDown(promptBox(), { key: 'Enter', metaKey: true });
    expect(onRun).toHaveBeenCalledTimes(1);
    release({ ok: false, error: 'copilot.error.failed' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Asking…' })).toBeNull());
    expect(screen.getByText('The AI request failed. Try again.')).toBeDefined();
  });

  it('shows the localized error for a refused run and stays open', async () => {
    const onClose = draw(
      vi.fn(async () => ({ ok: false, error: 'copilot.error.invalid' }) as CopilotRunOutcome),
    );
    fireEvent.change(promptBox(), { target: { value: 'x' } });
    fireEvent.click(runButton());
    await screen.findByText('The AI reply was not a valid edit list. Try rephrasing.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('submits on ⌘Enter but never mid-IME-composition or on a blank prompt', () => {
    const onRun = vi.fn(async () => ({ ok: true }) as CopilotRunOutcome);
    draw(onRun);
    // Blank prompt: the keyboard path re-guards what the disabled button blocks.
    fireEvent.keyDown(promptBox(), { key: 'Enter', metaKey: true });
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.change(promptBox(), { target: { value: 'x' } });
    // Plain Enter is a newline, not a submit.
    fireEvent.keyDown(promptBox(), { key: 'Enter' });
    expect(onRun).not.toHaveBeenCalled();
    // A kanji-conversion confirm must not fire the request.
    fireEvent.keyDown(promptBox(), { key: 'Enter', metaKey: true, isComposing: true });
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.keyDown(promptBox(), { key: 'Enter', ctrlKey: true });
    expect(onRun).toHaveBeenCalledWith('x');
  });

  it('closes via Escape and the cancel button without running anything', () => {
    const onRun = vi.fn(async () => ({ ok: true }) as CopilotRunOutcome);
    const onClose = draw(onRun);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onRun).not.toHaveBeenCalled();
  });
});
