import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InspectEnvelope, PlacedBox } from '../engine/types';
import { INITIAL_PREVIEW, type PreviewState } from '../preview/reducer';
import { useAdvisories } from './useAdvisories';

const ZERO = { x: 0, y: 0, w: 0, h: 0 };

function drawn(path: string, x: number): PlacedBox {
  return {
    path,
    border: ZERO,
    content: ZERO,
    text: { lines: [{ x, width: 80, baseline: 60, capTop: 43, emTop: 41, emBottom: 63 }] },
  };
}

const COLLIDING: InspectEnvelope = {
  engine: { version: '0', capabilities: [], builtinLocales: [] },
  document: {},
  boxes: { pages: [[drawn('a', 380), drawn('b', 430)]] },
  margin: [0, 0, 0, 0],
};

function state(over: Partial<PreviewState>): PreviewState {
  return { ...INITIAL_PREVIEW, ...over };
}

const READY = state({
  status: 'ready',
  lastGood: { pages: [], inspect: COLLIDING, scale: 1 },
});

describe('useAdvisories', () => {
  it('reports the collisions the last-good inspect carries', () => {
    const { result } = renderHook(() => useAdvisories(READY, undefined));
    expect(result.current.map((hit) => `${hit.a.path}|${hit.b.path}`)).toEqual(['a|b']);
  });

  it('reports nothing before the first render lands', () => {
    const { result } = renderHook(() => useAdvisories(INITIAL_PREVIEW, undefined));
    expect(result.current).toEqual([]);
  });

  it('reports nothing when the last-good render carried no inspect', () => {
    const noInspect = state({ lastGood: { pages: [], inspect: null, scale: 1 } });
    const { result } = renderHook(() => useAdvisories(noInspect, undefined));
    expect(result.current).toEqual([]);
  });

  it('is silent when the engine does not advertise text metrics', () => {
    const { result } = renderHook(() => useAdvisories(READY, ['style.border']));
    expect(result.current).toEqual([]);
  });

  it('reports when the engine advertises text metrics', () => {
    const { result } = renderHook(() => useAdvisories(READY, ['inspect.text_metrics']));
    expect(result.current).toHaveLength(1);
  });

  it('rides the last-good inspect through a render that came back not-ok', () => {
    // A mid-edit invalid document keeps the painted pages; the advisories the
    // reader is looking at must not blink out with them.
    const notOk = state({
      status: 'ready',
      lastGood: { pages: [], inspect: COLLIDING, scale: 1 },
      outcome: { ok: false, pages: [], inspect: null, diagnostics: { items: [] } },
    });
    const { result } = renderHook(() => useAdvisories(notOk, undefined));
    expect(result.current).toHaveLength(1);
  });
});
