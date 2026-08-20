import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PatternProbe, ProbeResult } from '../engine/types';
import { PATTERN_TOKENS, usePatternPreview } from './usePatternPreview';

const answer = (probes: readonly PatternProbe[]): ProbeResult[] =>
  probes.map((probe) => ({ sample: `<${probe.pattern}>`, warning: null, refused: null }));

describe('usePatternPreview', () => {
  it('asks for the pattern FIRST and every token after it, in one call', async () => {
    const probe = vi.fn(async (probes: readonly PatternProbe[]) => answer(probes));
    const { result } = renderHook(() => usePatternPreview('date', 'yyyy.MM', probe));
    await waitFor(() => expect(result.current.sample).toBe('<yyyy.MM>'));
    expect(probe).toHaveBeenCalledTimes(1);
    const asked = probe.mock.calls[0][0];
    expect(asked).toHaveLength(PATTERN_TOKENS.length + 1);
    expect(asked[0]).toEqual({ fieldType: 'date', pattern: 'yyyy.MM' });
    expect(result.current.tokens).toEqual(
      PATTERN_TOKENS.map((token) => ({ token, sample: `<${token}>` })),
    );
  });

  it('carries the engine’s warning through', async () => {
    const probe = async (probes: readonly PatternProbe[]) =>
      answer(probes).map((r) => ({ ...r, warning: 'unterminated quote' }));
    const { result } = renderHook(() => usePatternPreview('datetime', "yyyy'", probe));
    await waitFor(() => expect(result.current.warning).toBe('unterminated quote'));
  });

  it('re-asks when the pattern changes, and asks under the new field type', async () => {
    const probe = vi.fn(async (probes: readonly PatternProbe[]) => answer(probes));
    const { rerender, result } = renderHook(
      ({ pattern }: { pattern: string }) => usePatternPreview('date', pattern, probe),
      { initialProps: { pattern: 'y' } },
    );
    await waitFor(() => expect(result.current.sample).toBe('<y>'));
    rerender({ pattern: 'yyyy' });
    await waitFor(() => expect(result.current.sample).toBe('<yyyy>'));
  });

  it('ignores a SHORT answer rather than reading past its end', async () => {
    // A transport that answered fewer probes than were asked would otherwise
    // index into undefined; the surface keeps its previous preview.
    const probe = async () => [{ sample: 'partial', warning: null, refused: null }];
    const { result } = renderHook(() => usePatternPreview('date', 'y', probe));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.sample).toBe('');
    expect(result.current.tokens).toEqual([]);
  });

  it('survives a rejecting probe with no preview', async () => {
    const probe = async () => {
      throw new Error('transport down');
    };
    const { result } = renderHook(() => usePatternPreview('date', 'y', probe));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toEqual({ sample: '', warning: null, tokens: [] });
  });

  it('drops an answer that arrives after the pattern moved on', async () => {
    let release: (() => void) | undefined;
    const probe = vi.fn(async (probes: readonly PatternProbe[]) => {
      if (probes[0].pattern === 'y') {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return answer(probes);
    });
    const { rerender, result } = renderHook(
      ({ pattern }: { pattern: string }) => usePatternPreview('date', pattern, probe),
      { initialProps: { pattern: 'y' } },
    );
    rerender({ pattern: 'yyyy' });
    await waitFor(() => expect(result.current.sample).toBe('<yyyy>'));
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The stale answer describes a pattern nobody is looking at any more.
    expect(result.current.sample).toBe('<yyyy>');
  });

  it('offers only tokens the engine’s own table carries', () => {
    // Longest-match: every spelling here must be the one that actually matches
    // (a bare `d` would be shadowed by `dd` in a `dd` pattern, not the reverse).
    expect(PATTERN_TOKENS).toEqual(['yyyy', 'MM', 'MMMM', 'dd', 'EEEE', 'GG', 'a', 'HH', 'mm']);
    expect(new Set(PATTERN_TOKENS).size).toBe(PATTERN_TOKENS.length);
  });
});
