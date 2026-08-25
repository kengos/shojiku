import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { displaySample } from './TableColumnCells';
import { ColumnLabelCell, ColumnWidthCell } from './TableTextCells';

describe('displaySample', () => {
  it('shows a string value as-is', () => {
    expect(displaySample('東京都渋谷区')).toBe('東京都渋谷区');
  });

  it('shows an absent value as empty, never "undefined"/"null"', () => {
    expect(displaySample(undefined)).toBe('');
    expect(displaySample(null)).toBe('');
  });

  it('renders numbers and booleans as their literal text', () => {
    expect(displaySample(0)).toBe('0');
    expect(displaySample(12.5)).toBe('12.5');
    expect(displaySample(false)).toBe('false');
  });

  it('does NOT collapse a falsy 0/false to empty', () => {
    // The absent check is `=== undefined || === null` on purpose: a sample cell
    // holding 0 or false is real data and must stay visible.
    expect(displaySample(0)).not.toBe('');
    expect(displaySample(false)).not.toBe('');
  });

  it('serializes a structured value rather than printing [object Object]', () => {
    expect(displaySample({ a: 1 })).toBe('{"a":1}');
    expect(displaySample([1, 2])).toBe('[1,2]');
  });

  it('keeps a value of exactly the cap unclipped', () => {
    const at = 'x'.repeat(80);
    expect(displaySample(at)).toBe(at);
  });

  it('clips past the cap and marks the clip with an ellipsis', () => {
    const over = 'x'.repeat(81);
    const out = displaySample(over);
    expect(out).toBe(`${'x'.repeat(80)}…`);
    // The ellipsis is a marker, not part of the budget — the kept text is 80.
    expect(out.length).toBe(81);
  });
});

// The sheet cells were classified "not a blind spot" while the rule was
// "reseed on refusal": their caller keys them by value and neither builder
// returns null. Under the shipped rule — reseed after any committing blur —
// what matters is whether the commit can fail to MOVE the value, and
// `lengthOp` normalises through `Number`. The column FORM writes the same wire
// key through `TextField` and takes the entry back, so without these the two
// surfaces would disagree about one key.

describe('column cell reseed after a normalising commit', () => {
  it('takes back a width the builder normalised to the value already authored', () => {
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="en">
        <ColumnWidthCell label="Column width" value="40" onCommit={onCommit} />
      </I18nProvider>,
    );
    const cell = () => screen.getByLabelText('Column width') as HTMLInputElement;
    fireEvent.blur(cell(), { target: { value: '40.0' } });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('40.0');
    // `lengthOp` authors 40, so `value` never moves — only the nonce can
    // clear `40.0` off the screen.
    expect(cell().value).toBe('40');
  });

  it('takes back a padded label the same way', () => {
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="en">
        <ColumnLabelCell label="Column label" value="Item" onCommit={onCommit} />
      </I18nProvider>,
    );
    const cell = () => screen.getByLabelText('Column label') as HTMLInputElement;
    fireEvent.blur(cell(), { target: { value: '  Item  ' } });
    expect(cell().value).toBe('Item');
  });

  it('leaves both cells in place on an unchanged blur', () => {
    render(
      <I18nProvider locale="en">
        <ColumnWidthCell label="Column width" value="40" onCommit={vi.fn()} />
      </I18nProvider>,
    );
    const before = screen.getByLabelText('Column width');
    fireEvent.blur(before, { target: { value: '40' } });
    expect(screen.getByLabelText('Column width')).toBe(before);
  });
});
