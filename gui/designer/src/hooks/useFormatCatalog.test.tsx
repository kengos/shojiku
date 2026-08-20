// The catalog hook: when it asks the engine, when it does NOT, and what it
// does with an answer that arrives late or not at all.

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EngineTransport } from '../engine/transport';
import type { Diagnostics, FormatCatalog } from '../engine/types';
import { useFormatCatalog } from './useFormatCatalog';

const CATALOG: FormatCatalog = {
  types: [
    {
      fieldType: 'date',
      fixed: false,
      variants: [{ spelling: 'wareki', origin: 'pack', samples: ['令和8年11月3日'] }],
    },
  ],
  probes: [{ sample: '2026.11.03', warning: null, refused: null }],
};

const EMPTY: Diagnostics = { items: [] };

function baseTransport(): EngineTransport {
  return {
    validate: async () => EMPTY,
    renderRaw: async () => ({ ok: true, pages: [], inspect: null, diagnostics: EMPTY }),
  };
}

function withCatalog(fn = vi.fn(async () => CATALOG)): {
  transport: EngineTransport;
  fn: typeof fn;
} {
  return { transport: { ...baseTransport(), formatCatalog: fn }, fn };
}

describe('useFormatCatalog', () => {
  it('leaves the catalog null on a transport that cannot answer', async () => {
    // An older engine, or a host whose transport omits the query. The panel's
    // gate is this null — never a version sniff.
    const { result } = renderHook(() =>
      useFormatCatalog({ transport: baseTransport(), text: 't', key: 'k' }),
    );
    expect(result.current.catalog).toBeNull();
    await expect(result.current.probe([{ fieldType: 'date', pattern: 'y' }])).resolves.toEqual([]);
  });

  it('asks the engine once and exposes the answer', async () => {
    const { transport, fn } = withCatalog();
    const { result } = renderHook(() => useFormatCatalog({ transport, text: 't', key: 'k' }));
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.catalog?.types[0].variants[0].spelling).toBe('wareki');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT re-ask when only the body text changed', async () => {
    // The whole reason the hook takes a `key`: the catalog depends on the
    // `formats:` registry, `defaults:` and the locale, so a keystroke in the
    // document body must cost no engine call.
    const { transport, fn } = withCatalog();
    const { result, rerender } = renderHook(
      ({ text }) => useFormatCatalog({ transport, text, key: 'k' }),
      { initialProps: { text: 'one' } },
    );
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    rerender({ text: 'two' });
    rerender({ text: 'three' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-asks when the key changes', async () => {
    const { transport, fn } = withCatalog();
    const { rerender } = renderHook(({ key }) => useFormatCatalog({ transport, text: 't', key }), {
      initialProps: { key: 'one' },
    });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    rerender({ key: 'two' });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
  });

  it('probes against the LIVE text, not the text the callback was made with', async () => {
    // A probe is asked for at the moment somebody types a pattern; running it
    // against a stale document would preview a file nobody is editing.
    const { transport, fn } = withCatalog();
    const { result, rerender } = renderHook(
      ({ text }) => useFormatCatalog({ transport, text, key: 'k' }),
      { initialProps: { text: 'old' } },
    );
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    rerender({ text: 'new' });
    await result.current.probe([{ fieldType: 'date', pattern: 'yyyy' }]);
    expect(fn).toHaveBeenLastCalledWith('new', [{ fieldType: 'date', pattern: 'yyyy' }]);
  });

  it('returns the probe results', async () => {
    const { transport } = withCatalog();
    const { result } = renderHook(() => useFormatCatalog({ transport, text: 't', key: 'k' }));
    await expect(result.current.probe([{ fieldType: 'date', pattern: 'y' }])).resolves.toEqual(
      CATALOG.probes,
    );
  });

  it('asks nothing for an empty probe list', async () => {
    const { transport, fn } = withCatalog();
    const { result } = renderHook(() => useFormatCatalog({ transport, text: 't', key: 'k' }));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    await expect(result.current.probe([])).resolves.toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good catalog when a later ask fails', async () => {
    // Same posture as the canvas keeping its last good pages: a transport
    // hiccup is not worth blanking a working picker over.
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error('transport down');
      }
      return CATALOG;
    });
    const transport = { ...baseTransport(), formatCatalog: fn };
    const { result, rerender } = renderHook(
      ({ key }) => useFormatCatalog({ transport, text: 't', key }),
      {
        initialProps: { key: 'one' },
      },
    );
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    rerender({ key: 'two' });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    expect(result.current.catalog).not.toBeNull();
  });

  it('resolves a failed probe to an empty list rather than throwing', async () => {
    const transport = {
      ...baseTransport(),
      formatCatalog: vi.fn(async () => {
        throw new Error('transport down');
      }),
    };
    const { result } = renderHook(() => useFormatCatalog({ transport, text: 't', key: 'k' }));
    await expect(result.current.probe([{ fieldType: 'date', pattern: 'y' }])).resolves.toEqual([]);
  });

  it('drops an answer that arrives after the key moved on', async () => {
    // A catalog for a document nobody is looking at any more must not land.
    const answers: Array<(c: FormatCatalog) => void> = [];
    const fn = vi.fn(
      () =>
        new Promise<FormatCatalog>((resolve) => {
          answers.push(resolve);
        }),
    );
    const transport = { ...baseTransport(), formatCatalog: fn };
    const { result, rerender } = renderHook(
      ({ key }) => useFormatCatalog({ transport, text: 't', key }),
      {
        initialProps: { key: 'one' },
      },
    );
    rerender({ key: 'two' });
    await waitFor(() => expect(answers).toHaveLength(2));
    // Resolve the FIRST (now stale) ask only.
    answers[0]({ types: [], probes: [] });
    await Promise.resolve();
    expect(result.current.catalog).toBeNull();
  });
});
