import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineTransport, RenderOutcome } from '../engine/transport';
import { DEFAULT_DEBOUNCE_MS, usePreview } from './usePreview';

const outcome = (): RenderOutcome => ({
  ok: true,
  pages: [],
  inspect: null,
  diagnostics: { items: [] },
});

// Build the transport ONCE per test: its identity is a hook dependency, so a
// fresh object per render would re-fire the effect endlessly.
function transportWith(renderRaw: EngineTransport['renderRaw']): EngineTransport {
  return { validate: vi.fn(), renderRaw };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('usePreview', () => {
  it('renders after the default debounce and reaches "ready"', async () => {
    vi.useFakeTimers();
    const renderRaw = vi.fn().mockResolvedValue(outcome());
    const transport = transportWith(renderRaw);
    const { result } = renderHook(() => usePreview(transport, 'tpl', { params: 'p' }));
    expect(result.current.status).toBe('rendering');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS);
    });
    expect(renderRaw).toHaveBeenCalledWith('tpl', 'p', undefined, { scale: 2 });
    expect(result.current.status).toBe('ready');
  });

  it('honours custom scale/debounce/definitions and surfaces an error', async () => {
    vi.useFakeTimers();
    const renderRaw = vi.fn().mockRejectedValue(new Error('boom'));
    const transport = transportWith(renderRaw);
    const { result } = renderHook(() =>
      usePreview(transport, 'tpl', {
        params: 'p',
        definitions: 'd',
        scale: 3,
        debounceMs: 100,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(renderRaw).toHaveBeenCalledWith('tpl', 'p', 'd', { scale: 3 });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('boom');
  });

  it('coalesces rapid edits, running only the latest (debounce timer cleared)', async () => {
    vi.useFakeTimers();
    const renderRaw = vi.fn().mockResolvedValue(outcome());
    const transport = transportWith(renderRaw);
    const { rerender } = renderHook(
      ({ template }) => usePreview(transport, template, { params: 'p', debounceMs: 100 }),
      { initialProps: { template: 'a' } },
    );
    rerender({ template: 'b' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(renderRaw).toHaveBeenCalledTimes(1);
    expect(renderRaw).toHaveBeenCalledWith('b', 'p', undefined, { scale: 2 });
  });
});
