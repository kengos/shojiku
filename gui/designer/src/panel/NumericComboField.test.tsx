import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { NumericComboField } from './NumericComboField';

const PRESETS = [
  { value: '', label: '0.5', note: 'default' },
  { value: '0', note: 'no ruling' },
  { value: '1', sample: <span data-testid="sample-1">rule</span> },
];

function draw(props: Partial<Parameters<typeof NumericComboField>[0]> = {}) {
  const onCommit = vi.fn();
  render(
    <I18nProvider locale="en">
      <NumericComboField
        label="Ruling width"
        value=""
        presets={PRESETS}
        onCommit={onCommit}
        {...props}
      />
    </I18nProvider>,
  );
  return { onCommit };
}

const field = () => screen.getByLabelText('Ruling width') as HTMLInputElement;
const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruling width/ }));

describe('NumericComboField', () => {
  it('commits a typed value on blur', () => {
    const { onCommit } = draw();
    fireEvent.blur(field(), { target: { value: '1.5' } });
    expect(onCommit).toHaveBeenCalledWith('1.5');
  });

  it('commits NOTHING when the value did not change', () => {
    // A bare focus-and-leave is not an edit. Without this a tab through the panel
    // would author the value the field was already showing.
    const { onCommit } = draw({ value: '1.5' });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits a picked preset without any typing', () => {
    // The whole point: reachable with the mouse alone.
    const { onCommit } = draw();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /no ruling/ }));
    expect(onCommit).toHaveBeenCalledWith('0');
  });

  it('closes the menu once a preset is picked', () => {
    draw();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /no ruling/ }));
    expect(screen.queryByRole('menuitem', { name: /no ruling/ })).toBeNull();
  });

  it('picks the row whose value is EMPTY, so the default is reachable by mouse', () => {
    // The `default` row clears the key rather than authoring the default value —
    // it has to be pickable, or the only way back is to select-all and delete.
    const { onCommit } = draw({ value: '2' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /default/ }));
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('does not re-commit a preset that is already the value', () => {
    const { onCommit } = draw({ value: '0' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /no ruling/ }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not let pressing a row move focus, or the pick is lost to the blur', () => {
    // In a browser, mousedown on a row focuses it and blurs the input FIRST. The
    // blur commits the typed text, and if the popover closed on it the row would be
    // unmounted before its click could fire — so the reader's pick would be silently
    // replaced by whatever they had typed. jsdom fires no blur on click, so this
    // guard is the only thing standing between that flow and a lost edit; the
    // assertion is on `defaultPrevented`, which is what actually keeps the focus.
    draw();
    openMenu();
    const row = screen.getByRole('menuitem', { name: /no ruling/ });
    // `fireEvent` returns false when the handler called `preventDefault`.
    expect(fireEvent.mouseDown(row)).toBe(false);
  });

  it('shows each row’s note and sample, so a value says what it DOES', () => {
    draw();
    openMenu();
    expect(screen.getByText('no ruling')).toBeTruthy();
    expect(screen.getByText('default')).toBeTruthy();
    expect(screen.getByTestId('sample-1')).toBeTruthy();
  });

  it('does NOT commit on an Enter that is confirming an IME conversion', () => {
    // A Japanese author pressing Enter to accept a conversion would otherwise
    // commit a half-composed value. jsdom defaults `isComposing` to false, so
    // nothing but this case ever exercises it.
    //
    // The input must be FOCUSED first, or this case is vacuous: Enter commits by
    // calling `.blur()`, and blurring an unfocused element fires nothing — so it
    // would pass whether the guard existed or not. Its sibling below is the
    // control that proves the difference is the guard and not the focus.
    const { onCommit } = draw();
    const input = field();
    input.focus();
    input.value = '2';
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits on a real Enter', () => {
    const { onCommit } = draw();
    const input = field();
    input.focus();
    input.value = '2';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('2');
  });

  it('reseeds after a commit, so a refused value does not linger as if accepted', () => {
    // The model can refuse (an over-cap width authors nothing). Without the
    // reseed the rejected text stays on screen, and the NEXT blur sees no change
    // and commits nothing — the field would be stuck showing a lie.
    const { onCommit } = draw({ value: '1' });
    fireEvent.blur(field(), { target: { value: '99999' } });
    expect(onCommit).toHaveBeenCalledWith('99999');
    // Re-queried, because the input remounts on commit — a captured node would
    // be detached and the assertion vacuous.
    expect(field().value).toBe('1');
  });

  it('renders the unit and the placeholder without folding them into the field NAME', () => {
    // A wrapping label would take the unit pill into the accessible name.
    draw({ unit: 'pt', placeholder: '0.5' });
    expect(field().placeholder).toBe('0.5');
    expect(screen.getByText('pt')).toBeTruthy();
    expect(field().getAttribute('aria-label')).toBeNull();
  });

  it('shows a hint when given one', () => {
    draw({ hint: 'Unset draws a 0.5pt ruling; 0 draws none.' });
    expect(screen.getByText(/0 draws none/)).toBeTruthy();
  });
});
