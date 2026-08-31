// The locale-facts hook: when it asks the engine, when it does NOT, what it
// remembers, and — the one that matters most for a panel making a statement
// about the document — what it refuses to show.

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EngineTransport } from '../engine/transport';
import type { Diagnostics, LocaleFacts } from '../engine/types';
import { MAX_CACHED_FACTS, useLocaleFacts } from './useLocaleFacts';

const EMPTY: Diagnostics = { items: [] };

function factsFor(id: string): LocaleFacts {
  return {
    id,
    date: `date of ${id}`,
    number: '12,345,678.9',
    currencyDefault: 'JPY',
    amount: '1,234,568',
  };
}

function baseTransport(): EngineTransport {
  return {
    validate: async () => EMPTY,
    renderRaw: async () => ({ ok: true, pages: [], inspect: null, diagnostics: EMPTY }),
  };
}

/** The host injection a standalone app supplies; `null` = a builtin locale. */
const builtinsOnly = { overlayFor: async () => null };

function withFacts(fn = vi.fn(async (_t: string, id: string) => factsFor(id))): {
  transport: EngineTransport;
  fn: typeof fn;
} {
  return { transport: { ...baseTransport(), localeFacts: fn }, fn };
}

describe('useLocaleFacts', () => {
  it('leaves the facts null on a transport that cannot answer', async () => {
    // An engine without the `locale.facts` query. The panel's gate is this
    // null — never a version sniff — and it must never throw.
    const { result } = renderHook(() =>
      useLocaleFacts({
        transport: baseTransport(),
        text: 't',
        key: 'k',
        tag: 'ja-JP',
        localePacks: builtinsOnly,
        currencyKey: 'c',
      }),
    );
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('asks nothing when no locale is picked', async () => {
    const { transport, fn } = withFacts();
    renderHook(() =>
      useLocaleFacts({
        transport,
        text: 't',
        key: 'k',
        tag: '',
        currencyKey: 'c',
        localePacks: builtinsOnly,
      }),
    );
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
  });

  it('asks the engine with the pack the host supplies', async () => {
    const { transport, fn } = withFacts();
    const packs = { overlayFor: vi.fn(async () => 'id: th-TH\n') };
    const { result } = renderHook(() =>
      useLocaleFacts({
        transport,
        text: 'the doc',
        key: 'k',
        tag: 'th-TH',
        currencyKey: 'c',
        localePacks: packs,
      }),
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(packs.overlayFor).toHaveBeenCalledWith('th-TH');
    expect(fn).toHaveBeenCalledWith('the doc', 'th-TH', 'id: th-TH\n');
  });

  it('still asks when the host injects no pack source at all', async () => {
    // The embeddable default: a host that ships no packs is not an error, it
    // just cannot explain a non-builtin locale. The engine's own builtins
    // still answer, so the query is made with no overlay.
    const { transport, fn } = withFacts();
    const { result } = renderHook(() =>
      useLocaleFacts({
        transport,
        text: 't',
        key: 'k',
        tag: 'ja-JP',
        currencyKey: 'c',
        localePacks: undefined,
      }),
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(fn).toHaveBeenCalledWith('t', 'ja-JP', undefined);
  });

  it('degrades on a PACK locale when the host injects no pack source', async () => {
    // The other half of the no-injection host: a builtin answers (above),
    // and a locale whose pack the host cannot supply is refused by the
    // engine, so the panel explains nothing. Both arms, or the pair reads
    // as though an absent injection were harmless.
    const fn = vi.fn((_t: string, _id: string) =>
      Promise.reject<LocaleFacts>(new Error('locale error')),
    );
    const { transport } = withFacts(fn);
    const { result } = renderHook(() =>
      useLocaleFacts({
        transport,
        text: 't',
        key: 'k',
        tag: 'th-TH',
        currencyKey: 'c',
        localePacks: undefined,
      }),
    );
    await waitFor(() => expect(fn).toHaveBeenCalledWith('t', 'th-TH', undefined));
    expect(result.current).toBeNull();
  });

  it('never captions one tag with another tag’s facts', async () => {
    // The load-bearing property. Between picking a new locale and the engine
    // answering, showing the previous locale's samples would be a statement
    // about the document that is simply false.
    let release: (facts: LocaleFacts) => void = () => undefined;
    const fn = vi.fn(
      (_t: string, id: string) =>
        new Promise<LocaleFacts>((resolve) => {
          if (id === 'ja-JP') {
            resolve(factsFor(id));
          } else {
            release = resolve;
          }
        }),
    );
    const { transport } = withFacts(fn);
    const { result, rerender } = renderHook(
      (tag: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key: 'k',
          tag,
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'ja-JP' },
    );
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    rerender('en-US');
    expect(result.current).toBeNull();
    // `release` is assigned when the engine is actually CALLED, which happens
    // a microtask later (behind the overlay fetch) — resolving before that
    // would fire the initial no-op and prove nothing.
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    release(factsFor('en-US'));
    await waitFor(() => expect(result.current?.id).toBe('en-US'));
  });

  it('does not caption a new CURRENCY with the old currency’s amount', async () => {
    // The same false sentence the tag guard refuses, one field down: a stale
    // amount sits directly under the Currency control that now reads
    // something else. Unlike the canvas's last-good pixels, the thing
    // contradicting it is on screen beside it.
    //
    // Both inputs move together, because both derive from the same
    // `defaults:` block — `currencyKey` is a NARROWING of `key`, never an
    // independent axis, so varying one alone would be a shape the app cannot
    // produce.
    const { transport } = withFacts();
    const { result, rerender } = renderHook(
      (p: { key: string; currencyKey: string }) =>
        useLocaleFacts({
          transport,
          text: 't',
          key: p.key,
          tag: 'ja-JP',
          currencyKey: p.currencyKey,
          localePacks: builtinsOnly,
        }),
      { initialProps: { key: 'currency: JPY', currencyKey: '["JPY"]' } },
    );
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    rerender({ key: 'currency: USD', currencyKey: '["USD"]' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
  });

  it('keeps the lines through an edit that cannot change them', async () => {
    // A font-size commit moves the catalog `key` (the whole `defaults:`
    // slice) but neither the tag nor the currency, so nothing blanks — which
    // is why the guard is not simply `key`.
    const { transport, fn } = withFacts();
    const { result, rerender } = renderHook(
      (key: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key,
          tag: 'ja-JP',
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'k1' },
    );
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    rerender('k2');
    expect(result.current?.id).toBe('ja-JP');
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });

  it('remembers an answer, so re-picking a locale costs no engine call', async () => {
    const { transport, fn } = withFacts();
    const { result, rerender } = renderHook(
      (tag: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key: 'k',
          tag,
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'ja-JP' },
    );
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    rerender('en-US');
    await waitFor(() => expect(result.current?.id).toBe('en-US'));
    rerender('ja-JP');
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not confuse two (tag, slice) pairs that share a flattening', async () => {
    // The cache key is composed of a free-entry TAG and a document slice, so a
    // separator either part can contain would let one entry answer for two
    // different picks — a caption about the wrong locale, which is exactly
    // what this hook refuses to do elsewhere.
    const { transport, fn } = withFacts();
    const { result, rerender } = renderHook(
      (p: { tag: string; key: string }) =>
        useLocaleFacts({
          transport,
          text: 't',
          key: p.key,
          tag: p.tag,
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: { tag: 'a', key: 'b c' } },
    );
    await waitFor(() => expect(result.current?.id).toBe('a'));
    rerender({ tag: 'a b', key: 'c' });
    await waitFor(() => expect(result.current?.id).toBe('a b'));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears the memory rather than growing it without bound', async () => {
    // The locale field is a combo with free entry, so its tag is user input
    // and it keys this cache.
    const { transport, fn } = withFacts();
    const { result, rerender } = renderHook(
      (tag: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key: 'k',
          tag,
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'tag-0' },
    );
    for (let n = 0; n <= MAX_CACHED_FACTS; n += 1) {
      rerender(`tag-${n}`);
      await waitFor(() => expect(result.current?.id).toBe(`tag-${n}`));
    }
    // The first tag is gone from the cache, so asking again costs a call.
    const before = fn.mock.calls.length;
    rerender('tag-0');
    await waitFor(() => expect(result.current?.id).toBe('tag-0'));
    expect(fn.mock.calls.length).toBe(before + 1);
  });

  it('explains nothing when the host cannot supply the pack', async () => {
    // A tag this deployment ships no pack for: the fetch rejects, and the
    // panel says nothing rather than guessing. Never a throw out of a render.
    const { transport, fn } = withFacts();
    const packs = { overlayFor: vi.fn(async () => Promise.reject(new Error('404'))) };
    const { result } = renderHook(() =>
      useLocaleFacts({
        transport,
        text: 't',
        key: 'k',
        tag: 'zz-ZZ',
        currencyKey: 'c',
        localePacks: packs,
      }),
    );
    await Promise.resolve();
    await waitFor(() => expect(packs.overlayFor).toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('explains nothing when the engine refuses the locale', async () => {
    const fn = vi.fn((_t: string, _id: string) =>
      Promise.reject<LocaleFacts>(new Error('locale error')),
    );
    const { transport } = withFacts(fn);
    const { result } = renderHook(() =>
      useLocaleFacts({
        transport,
        text: 't',
        key: 'k',
        tag: 'zz-ZZ',
        currencyKey: 'c',
        localePacks: builtinsOnly,
      }),
    );
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('keeps the last good facts when a same-tag re-ask REJECTS', async () => {
    // A rejection is not a new answer, so the sentence on screen — which is
    // still about the tag on screen — stays. Distinct from a rejection with
    // nothing to fall back to, where the panel explains nothing.
    let calls = 0;
    const fn = vi.fn((_t: string, id: string) => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(factsFor(id))
        : Promise.reject<LocaleFacts>(new Error('locale error'));
    });
    const { transport } = withFacts(fn);
    const { result, rerender } = renderHook(
      (key: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key,
          tag: 'ja-JP',
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'k1' },
    );
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    rerender('k2');
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(result.current?.id).toBe('ja-JP');
  });

  it('discards an answer that arrives after the pick moved on', async () => {
    let release: (facts: LocaleFacts) => void = () => undefined;
    const fn = vi.fn(
      (_t: string, id: string) =>
        new Promise<LocaleFacts>((resolve) => {
          if (id === 'slow') {
            release = resolve;
          } else {
            resolve(factsFor(id));
          }
        }),
    );
    const { transport } = withFacts(fn);
    const { result, rerender } = renderHook(
      (tag: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key: 'k',
          tag,
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'slow' },
    );
    rerender('ja-JP');
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    release(factsFor('slow'));
    await Promise.resolve();
    expect(result.current?.id).toBe('ja-JP');
  });

  it('keeps the last good facts while a same-tag re-ask is in flight', async () => {
    // An out-of-date AMOUNT for the tag on screen is last-good, the way the
    // canvas keeps its last good pages — unlike a WRONG tag, which is a false
    // statement rather than a stale one.
    let release: (facts: LocaleFacts) => void = () => undefined;
    let calls = 0;
    const fn = vi.fn((_t: string, id: string) => {
      calls += 1;
      return calls === 1
        ? Promise.resolve(factsFor(id))
        : new Promise<LocaleFacts>((resolve) => {
            release = resolve;
          });
    });
    const { transport } = withFacts(fn);
    const { result, rerender } = renderHook(
      (key: string) =>
        useLocaleFacts({
          transport,
          text: 't',
          key,
          tag: 'ja-JP',
          currencyKey: 'c',
          localePacks: builtinsOnly,
        }),
      { initialProps: 'k1' },
    );
    await waitFor(() => expect(result.current?.id).toBe('ja-JP'));
    rerender('k2');
    expect(result.current?.id).toBe('ja-JP');
    // Same microtask ordering as above: wait for the call before resolving it.
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    release({ ...factsFor('ja-JP'), amount: '9,999' });
    await waitFor(() => expect(result.current?.amount).toBe('9,999'));
  });
});
