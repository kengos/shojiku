// The inline format bar. What is worth pinning is not that five controls
// render, but WHICH marks the bar offers and what each press means: the four
// mark keys and no metric, a decoration that replaces rather than accumulates,
// and every control dead when there is nothing selected.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { RunFormatBar } from './RunFormatBar';
import { NO_MARKS, type RunMarks } from './spanRuns';

afterEach(cleanup);

function show(marks: RunMarks | null, onMark = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <RunFormatBar marks={marks} onMark={onMark} />
    </I18nProvider>,
  );
  return onMark;
}

/** Run the transform the bar handed up against a starting mark set — the bar
 * reports a FUNCTION, so the assertion has to apply it. */
function resultOf(onMark: ReturnType<typeof vi.fn>, from: RunMarks = NO_MARKS): RunMarks {
  return onMark.mock.calls[0][0](from);
}

describe('RunFormatBar', () => {
  it('offers the four MARKS and no metric', () => {
    // The `canvas/InlineTextEditor` boundary made visible: a control for a
    // metric here would mean the surface had begun predicting the engine's
    // line breaks.
    show(NO_MARKS);
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Text color']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    for (const absent of ['Font size', 'Font family']) {
      expect(screen.queryByRole('button', { name: absent })).toBeNull();
    }
  });

  it('disables every control when nothing is selected', () => {
    show(null);
    for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }
  });

  it('shows a mark the selection shares as pressed', () => {
    show({ ...NO_MARKS, bold: true, decoration: 'underline' });
    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Underline' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('sets a mark the selection does not share', () => {
    const onMark = show(NO_MARKS);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(resultOf(onMark).bold).toBe(true);
  });

  it('clears a mark the selection already shares', () => {
    const onMark = show({ ...NO_MARKS, italic: true });
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    expect(resultOf(onMark, { ...NO_MARKS, italic: true }).italic).toBe(false);
  });

  it('REPLACES the decoration rather than adding a second line', () => {
    // One wire key, three values — so underline over a struck selection cannot
    // mean "both".
    const onMark = show({ ...NO_MARKS, decoration: 'line_through' });
    fireEvent.click(screen.getByRole('button', { name: 'Underline' }));
    expect(resultOf(onMark).decoration).toBe('underline');
  });

  it('clears the decoration on a second press of the same one', () => {
    const onMark = show({ ...NO_MARKS, decoration: 'line_through' });
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }));
    expect(resultOf(onMark).decoration).toBe('none');
  });

  it('sets a colour the picker committed', () => {
    // Colour is a VALUE, not a toggle: it rides the same `onMark` transform, so
    // the surface has ONE way to change a fragment's marks. Driven the way the
    // format toolbar's own suite drives this shared picker — by the swatch's
    // accessible name, so the case cannot pass without a swatch being clicked.
    const onMark = show(NO_MARKS);
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Red, shade 4 of 5' }));
    expect(resultOf(onMark).color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('clears a colour through the same door', () => {
    const onMark = show({ ...NO_MARKS, color: '#c2402a' });
    fireEvent.click(screen.getByRole('button', { name: 'Text color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(resultOf(onMark, { ...NO_MARKS, color: '#c2402a' }).color).toBe('');
  });

  it('names itself, so a screen reader can find the group', () => {
    show(NO_MARKS);
    expect(screen.getByRole('toolbar', { name: 'Text formatting' })).toBeTruthy();
  });

  it('renders the shell it is handed beside the marks', () => {
    render(
      <I18nProvider locale="en">
        <RunFormatBar marks={NO_MARKS} onMark={vi.fn()}>
          <button type="button">Insert field</button>
        </RunFormatBar>
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Insert field' })).toBeTruthy();
  });
});
