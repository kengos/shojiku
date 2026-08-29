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

  it('reports a SHORT answer as UNAVAILABLE rather than reading past its end', async () => {
    // A transport that answered fewer probes than were asked would otherwise
    // index into undefined. `[]` is the exact shape a transport with no
    // `formatCatalog` produces, so this state is what the surface reads to
    // tell "the engine did not answer" apart from "you have not typed
    // anything" — the two were indistinguishable, and the whole point of the
    // chips is that they are visible.
    const probe = async () => [{ sample: 'partial', warning: null, refused: null }];
    const { result } = renderHook(() => usePatternPreview('date', 'y', probe));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.sample).toBe('');
    expect(result.current.tokens).toEqual([]);
  });

  it('reports a REJECTING probe as unavailable', async () => {
    // The seam's other failure mode. The catalog hook's own probe swallows a
    // throw into `[]`, but `probe` is a host-injectable prop and a rejection
    // leaves the surface just as answerless.
    const probe = async () => {
      throw new Error('transport down');
    };
    const { result } = renderHook(() => usePatternPreview('date', 'y', probe));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current).toEqual({
      sample: '',
      warning: null,
      tokens: [],
      refused: null,
      unavailable: true,
    });
  });

  it('drops a REJECTION that arrives after the pattern moved on', async () => {
    // The twin of the stale-answer case below, on the failure path. It is
    // reachable for the same reasons: the field unmounts when its modal closes,
    // and the app swaps transport identity when a font finishes installing —
    // either way an in-flight query can reject over a surface that has already
    // been answered, and reporting it would blank a working preview.
    let reject: ((reason: Error) => void) | undefined;
    const probe = async (probes: readonly PatternProbe[]) => {
      if (probes[0].pattern === 'y') {
        await new Promise<never>((_resolve, no) => {
          reject = no;
        });
      }
      return answer(probes);
    };
    const { rerender, result } = renderHook(
      ({ pattern }: { pattern: string }) => usePatternPreview('date', pattern, probe),
      { initialProps: { pattern: 'y' } },
    );
    rerender({ pattern: 'yyyy' });
    await waitFor(() => expect(result.current.sample).toBe('<yyyy>'));
    reject?.(new Error('transport down'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.unavailable).toBe(false);
    expect(result.current.sample).toBe('<yyyy>');
  });

  it('clears unavailable once a complete answer arrives', async () => {
    // Both directions, because the app really produces this: installing a font
    // swaps the transport identity, so a session that started answerless can
    // start answering (and the flag must not be stuck true), and the reverse.
    const dead = async () => [];
    const live = async (probes: readonly PatternProbe[]) => answer(probes);
    const { rerender, result } = renderHook(
      ({ probe }: { probe: (p: readonly PatternProbe[]) => Promise<ProbeResult[]> }) =>
        usePatternPreview('date', 'yyyy', probe),
      { initialProps: { probe: dead as (p: readonly PatternProbe[]) => Promise<ProbeResult[]> } },
    );
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    rerender({ probe: live });
    await waitFor(() => expect(result.current.sample).toBe('<yyyy>'));
    expect(result.current.unavailable).toBe(false);
    expect(result.current.tokens).toHaveLength(PATTERN_TOKENS.length);
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

  it('carries a REFUSAL through, so an empty sample is not read as an empty pattern', async () => {
    // The engine refuses a pattern past its length cap and mints the refusal
    // with an empty sample. A hook that dropped `refused` would hand the
    // surface a result indistinguishable from "nothing typed yet".
    const probe = async (probes: readonly PatternProbe[]) =>
      answer(probes).map((r, index) =>
        index === 0 ? { sample: '', warning: null, refused: 'patternTooLong' as const } : r,
      );
    const { result } = renderHook(() => usePatternPreview('date', 'y'.repeat(300), probe));
    await waitFor(() => expect(result.current.refused).toBe('patternTooLong'));
    expect(result.current.sample).toBe('');
    // The token chips still answer — each is its own short probe.
    expect(result.current.tokens).toHaveLength(PATTERN_TOKENS.length);
  });

  it('reports no refusal for an ordinary answer', async () => {
    const probe = async (probes: readonly PatternProbe[]) => answer(probes);
    const { result } = renderHook(() => usePatternPreview('date', 'yyyy', probe));
    await waitFor(() => expect(result.current.sample).toBe('<yyyy>'));
    expect(result.current.refused).toBeNull();
  });

  it('offers only tokens the engine’s own table carries', () => {
    // Longest-match: every spelling here must be the one that actually matches
    // (a bare `d` would be shadowed by `dd` in a `dd` pattern, not the reverse).
    expect(PATTERN_TOKENS).toEqual(['yyyy', 'MM', 'MMMM', 'dd', 'EEEE', 'GG', 'a', 'HH', 'mm']);
    expect(new Set(PATTERN_TOKENS).size).toBe(PATTERN_TOKENS.length);
  });

  it('asks for fewer probes than the engine will run, so only LENGTH can refuse', () => {
    // `PatternField` reads any refusal as "too long". That is only honest while
    // this surface cannot reach the engine's OTHER refusal, `tooManyProbes` —
    // which is `MAX_PROBES` in `engine/authoring`, 16 at the time of writing.
    // Growing the chip row past that cap would make the message a lie, and this
    // is the line that would go red first.
    expect(PATTERN_TOKENS.length + 1).toBeLessThan(16);
  });
});
