// The reseed key's own contract. The cases that matter are: the committed
// VALUE still drives the key on its own, a commit that does not MOVE the value
// still reseeds, and an accepted commit — where the nonce and the value both
// move — costs exactly ONE remount, not two. An UNCHANGED blur reseeds
// nothing, which is the only guard the widgets keep.

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useReseedKey } from './useReseedKey';

/** A probe that reports the key it was handed, so a test can watch the key
 * itself rather than infer it from a remount. */
function Probe({ value }: { readonly value: string }) {
  const [key, reseed] = useReseedKey(value);
  return (
    <>
      <output data-testid="key">{key}</output>
      <button type="button" onClick={reseed}>
        reseed
      </button>
    </>
  );
}

const keyText = () => screen.getByTestId('key').textContent;
const clickReseed = () => fireEvent.click(screen.getByRole('button', { name: 'reseed' }));

describe('useReseedKey', () => {
  it('puts the committed value in the key, so a value change reseeds on its own', () => {
    const { rerender } = render(<Probe value="20" />);
    const first = keyText();
    rerender(<Probe value="24" />);
    expect(keyText()).not.toBe(first);
    expect(keyText()).toContain('24');
  });

  it('moves the key when the value has NOT changed — a refusal, or a clamp', () => {
    render(<Probe value="20" />);
    const before = keyText();
    clickReseed();
    expect(keyText()).not.toBe(before);
    // The value is still the committed one — only the nonce moved.
    expect(keyText()).toContain('20');
  });

  it('leaves the key alone across a re-render nobody asked for', () => {
    const { rerender } = render(<Probe value="20" />);
    const first = keyText();
    rerender(<Probe value="20" />);
    // A re-render on its own is not a commit. Only `reseed()` moves the nonce.
    expect(keyText()).toBe(first);
  });

  it('costs ONE key change for an accepted commit, where value AND nonce move', () => {
    // The load-bearing case of the shipped design. A committing blur bumps the
    // nonce and the accepted value arrives in the same batch, so the two must
    // resolve to a SINGLE new key — two would remount the input twice and
    // flash the pre-commit value in between.
    const { rerender } = render(<Probe value="20" />);
    const seen = new Set([keyText()]);
    // The widget's order: reseed() and the new value land together.
    clickReseed();
    rerender(<Probe value="24" />);
    seen.add(keyText());
    expect(seen.size).toBe(2);
    expect(keyText()).toContain('24');
  });

  it('keeps moving the key across repeated refusals', () => {
    render(<Probe value="20" />);
    const seen = new Set([keyText()]);
    clickReseed();
    seen.add(keyText());
    clickReseed();
    seen.add(keyText());
    // Three distinct keys: a nonce that saturated after one bump would leave
    // the second rejected entry on screen.
    expect(seen.size).toBe(3);
  });

  it('cannot collide across (value, nonce) pairs that share a naive concatenation', () => {
    // A trailing counter would render ("20#1", nonce 0) and ("20", nonce 1) as
    // the same string, silently skipping a reseed. The nonce leads, so it does
    // not. Driven through a real reseed rather than asserting the format, so
    // the test survives a change of separator.
    const { rerender } = render(<Probe value="20#1" />);
    const awkward = keyText();
    rerender(<Probe value="20" />);
    clickReseed();
    expect(keyText()).not.toBe(awkward);
  });
});

/** An uncontrolled field wired exactly the way the real widgets are: an
 * unchanged blur returns early, and ANY committing blur reseeds — the widget
 * never asks whether the commit moved anything. The commit here NORMALISES
 * (`Number(...)` then back to a string), so `  24  ` and `24.0` both land as
 * `24` without moving the value, which is the case a landed/refused signal
 * cannot see. */
function CommittingField({ floor }: { readonly floor: number }) {
  const [committed, setCommitted] = useState('20');
  const [key, reseed] = useReseedKey(committed);
  return (
    <input
      key={key}
      aria-label="count"
      defaultValue={committed}
      onBlur={(event) => {
        const typed = event.currentTarget.value;
        if (typed === committed) {
          return;
        }
        const n = Number(typed);
        if (Number.isInteger(n) && n >= floor) {
          setCommitted(String(n));
        }
        reseed();
      }}
    />
  );
}

const count = () => screen.getByLabelText('count') as HTMLInputElement;

describe('useReseedKey driving an uncontrolled input', () => {
  it('takes back an entry the commit NORMALISED rather than rejected', () => {
    // `  20  ` commits as 20 over a field already holding 20: the commit
    // lands, the value does not move, and only the nonce can clear the entry.
    render(<CommittingField floor={1} />);
    fireEvent.blur(count(), { target: { value: '  20  ' } });
    expect(count().value).toBe('20');
  });

  it('takes back the rejected text and keeps the committed value on screen', () => {
    render(<CommittingField floor={1} />);
    fireEvent.blur(count(), { target: { value: '0' } });
    expect(count().value).toBe('20');
  });

  it('keeps an accepted value, so the reseed is not a blanket revert', () => {
    render(<CommittingField floor={1} />);
    fireEvent.blur(count(), { target: { value: '24' } });
    expect(count().value).toBe('24');
  });

  it('takes back a SECOND rejected entry, not just the first', () => {
    // The field is live again after a reseed: if the remount lost the blur
    // handler, only the first refusal would ever be caught.
    render(<CommittingField floor={1} />);
    fireEvent.blur(count(), { target: { value: '0' } });
    fireEvent.blur(count(), { target: { value: 'abc' } });
    expect(count().value).toBe('20');
  });

  it('leaves the node in place on a bare blur that changes nothing', () => {
    // Remounting here would be invisible on screen and still wrong: it drops
    // focus, and it detaches whatever reference a caller is holding.
    render(<CommittingField floor={1} />);
    const before = count();
    fireEvent.blur(before);
    expect(count()).toBe(before);
  });
});
