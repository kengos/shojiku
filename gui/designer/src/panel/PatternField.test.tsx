import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { fakeProbe } from '../testkit/formatCatalog';
import { PatternField } from './PatternField';

function draw(over: Partial<Parameters<typeof PatternField>[0]> = {}) {
  const onCommit = vi.fn();
  render(
    <I18nProvider locale="en">
      <PatternField
        label="Pattern"
        fieldType="date"
        value=""
        probe={fakeProbe()}
        onCommit={onCommit}
        {...over}
      />
    </I18nProvider>,
  );
  return { onCommit, field: () => screen.getByLabelText('Pattern') as HTMLInputElement };
}

describe('PatternField', () => {
  it('shows each token with ITS OWN output — the point of the chip row', async () => {
    draw();
    // An author does not have to know what `EEEE` means if the chip shows it.
    expect(await screen.findByRole('button', { name: 'Insert EEEE' })).toBeTruthy();
    expect(screen.getByText('[EEEE]')).toBeTruthy();
  });

  it('appends a chip when the field has not been touched', async () => {
    const { onCommit, field } = draw({ value: 'yyyy' });
    fireEvent.click(await screen.findByRole('button', { name: 'Insert MM' }));
    await waitFor(() => expect(field().value).toBe('yyyyMM'));
    expect(onCommit).toHaveBeenCalledWith('yyyyMM');
  });

  it('inserts a chip AT THE CARET once the field has been used', async () => {
    const { field } = draw({ value: 'yyyy年日' });
    const el = field();
    el.setSelectionRange(5, 5);
    fireEvent.select(el);
    fireEvent.click(await screen.findByRole('button', { name: 'Insert MM' }));
    await waitFor(() => expect(field().value).toBe('yyyy年MM日'));
  });

  it('commits on blur only when the pattern actually changed', () => {
    const { onCommit, field } = draw({ value: 'yyyy' });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: 'yyyy.MM' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith('yyyy.MM');
  });

  it('reports every keystroke to a caller holding a draft', () => {
    const onChange = vi.fn();
    const { field } = draw({ onChange });
    fireEvent.change(field(), { target: { value: 'y' } });
    // Without this a Save clicked straight from the field would read the
    // pre-blur value.
    expect(onChange).toHaveBeenCalledWith('y');
  });

  it('reseeds from the document — an undo must not leave a stale draft', async () => {
    const { rerender } = render(
      <I18nProvider locale="en">
        <PatternField
          label="Pattern"
          fieldType="date"
          value="yyyy"
          probe={fakeProbe()}
          onCommit={vi.fn()}
        />
      </I18nProvider>,
    );
    rerender(
      <I18nProvider locale="en">
        <PatternField
          label="Pattern"
          fieldType="date"
          value="MM"
          probe={fakeProbe()}
          onCommit={vi.fn()}
        />
      </I18nProvider>,
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Pattern') as HTMLInputElement).value).toBe('MM'),
    );
  });

  it('prompts rather than showing a blank preview line for an empty pattern', async () => {
    draw({ probe: fakeProbe((pattern) => (pattern === '' ? '' : `[${pattern}]`)) });
    expect(await screen.findByText('Press a token above, or type a pattern.')).toBeTruthy();
  });

  it('shows the engine’s warning verbatim — the engine never translates', async () => {
    draw({ value: "yyyy'", probe: fakeProbe(undefined, 'unterminated quote') });
    expect(await screen.findByText('unterminated quote')).toBeTruthy();
  });
});
