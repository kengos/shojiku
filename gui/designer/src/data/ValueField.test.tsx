// The sample-value widgets' reseed contract, driven directly rather than
// through the data editor — `ValueField` had no sibling unit test, and the
// cases below are about the WIDGET's own behaviour, not the editor's fixture.
//
// The defect these pin is the one GUI-5 removed from the property panel,
// arriving here through the data editor instead: the call site keys the widget
// by `value`, which cannot move when a commit authors nothing or authors a
// REWRITTEN value, so the entry the editor did not take used to stay on screen.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import type { SampleKind } from '../sample/model';
import { ValueField } from './ValueField';

function draw(kind: SampleKind, value: string, onCommit = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ValueField
        label="Sample"
        kind={kind}
        value={value}
        engineLocale="ja-JP"
        onCommit={onCommit}
      />
    </I18nProvider>,
  );
  return { onCommit, field: () => screen.getByLabelText('Sample') as HTMLInputElement };
}

describe('ValueField — a cleared datetime', () => {
  const TS = '2024-01-02T05:06:07+09:00';

  it('authors nothing, and takes the blank back', () => {
    // There is no blank RFC 3339 value to write, so the sample cannot move —
    // which is exactly why the call site's `key={value}` cannot reseed it.
    const { onCommit, field } = draw('datetime', TS);
    const before = field().value;
    expect(before).not.toBe('');
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(field().value).toBe(before);
  });

  it('still commits a real datetime edit', () => {
    const { onCommit, field } = draw('datetime', TS);
    fireEvent.change(field(), { target: { value: '2024-03-04T08:09' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledOnce();
    expect(String(onCommit.mock.calls[0][0])).toContain('2024-03-04');
  });

  it('leaves the input in place on an unchanged blur', () => {
    const { onCommit, field } = draw('datetime', TS);
    const before = field();
    fireEvent.blur(before);
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toBe(before);
  });
});

describe('ValueField — a normalising number', () => {
  it('takes back an entry the sample coercion rewrites to the value already held', () => {
    // `coerceSampleValue('number', …)` runs `Number(raw)`, so `100.0` over a
    // 100 authors 100: the commit LANDS and the sample does not move. Asking
    // "was it refused?" would answer no and leave `100.0` on screen.
    const { onCommit, field } = draw('number', '100');
    fireEvent.change(field(), { target: { value: '100.0' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('100.0');
    expect(field().value).toBe('100');
  });

  it('leaves the input in place on an unchanged blur', () => {
    const { onCommit, field } = draw('number', '100');
    const before = field();
    fireEvent.blur(before);
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toBe(before);
  });
});

describe('ValueField — a string textarea', () => {
  it('takes the entry back when the commit does not move the sample', () => {
    // The parent owns the value, so a re-render with the SAME value is what a
    // rejected or rewritten commit looks like from here.
    const { onCommit } = draw('string', 'hello');
    const box = () => screen.getByLabelText('Sample') as HTMLTextAreaElement;
    fireEvent.change(box(), { target: { value: 'hello world' } });
    fireEvent.blur(box());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('hello world');
    expect(box().value).toBe('hello');
  });

  it('leaves the textarea in place on an unchanged blur', () => {
    const box = () => screen.getByLabelText('Sample') as HTMLTextAreaElement;
    draw('string', 'hello');
    const before = box();
    fireEvent.blur(before);
    expect(box()).toBe(before);
  });
});
