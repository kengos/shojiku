import { describe, expect, it, vi } from 'vitest';
import { moduleLoadTracker, parseContentLength } from './moduleLoad';

describe('parseContentLength', () => {
  it('accepts a plain non-negative integer', () => {
    expect(parseContentLength('1668242')).toBe(1668242);
  });

  it('is undefined when the header is absent (chunked encoding)', () => {
    expect(parseContentLength(null)).toBeUndefined();
  });

  // `Number()` is far more lenient than a Content-Length ever is; each of these
  // would otherwise become a plausible-looking total and drive a lying bar.
  it.each([
    ['empty', ''],
    ['whitespace-padded', '  12  '],
    ['hexadecimal', '0x10'],
    ['fractional', '12.5'],
    ['negative', '-12'],
    ['exponent', '1e6'],
    ['the word Infinity', 'Infinity'],
    ['non-numeric', 'lots'],
    ['zero', '0'],
  ])('is undefined for a %s header', (_label, header) => {
    expect(parseContentLength(header)).toBeUndefined();
  });

  it('is undefined past the safe-integer range', () => {
    expect(parseContentLength('9'.repeat(20))).toBeUndefined();
  });
});

describe('moduleLoadTracker', () => {
  it('starts loading with nothing reported', () => {
    expect(moduleLoadTracker().get()).toEqual({ kind: 'loading', bytes: { loaded: 0 } });
  });

  it('accumulates chunks against the declared total and notifies subscribers', () => {
    const tracker = moduleLoadTracker();
    const listener = vi.fn();
    tracker.subscribe(listener);

    tracker.expect(1000);
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 0, total: 1000 } });
    tracker.advance(400);
    tracker.advance(350);
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 750, total: 1000 } });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('leaves the reading total-less when no Content-Length was usable', () => {
    const tracker = moduleLoadTracker();
    tracker.expect(undefined);
    tracker.advance(4096);
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 4096, total: undefined } });
  });

  it('publishes a stable snapshot reference between changes', () => {
    const tracker = moduleLoadTracker();
    const first = tracker.get();
    expect(tracker.get()).toBe(first);
    tracker.advance(1);
    expect(tracker.get()).not.toBe(first);
  });

  it('stops notifying an unsubscribed listener', () => {
    const tracker = moduleLoadTracker();
    const listener = vi.fn();
    const off = tracker.subscribe(listener);
    off();
    tracker.advance(10);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reaches ready on finish and failed on fail', () => {
    const ready = moduleLoadTracker();
    ready.finish();
    expect(ready.get()).toEqual({ kind: 'ready' });

    const broken = moduleLoadTracker();
    broken.fail();
    expect(broken.get()).toEqual({ kind: 'failed' });
  });

  // Terminality matters for the UI, not for arithmetic: a straggling chunk must
  // not reopen a loading view the user has already moved past.
  it('ignores a late expect/advance after finish', () => {
    const tracker = moduleLoadTracker();
    tracker.finish();
    const listener = vi.fn();
    tracker.subscribe(listener);
    tracker.expect(500);
    tracker.advance(500);
    expect(tracker.get()).toEqual({ kind: 'ready' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores a late expect/advance after fail', () => {
    const tracker = moduleLoadTracker();
    tracker.fail();
    tracker.expect(500);
    tracker.advance(500);
    expect(tracker.get()).toEqual({ kind: 'failed' });
  });
});
