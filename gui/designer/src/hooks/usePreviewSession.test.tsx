// The freshness half of the preview session, plus the scale it asks the engine
// for. The render loop itself is covered by `preview/usePreview`; what is
// asserted here is the one thing composing the draft changed — a render of
// UNCOMMITTED text is never reported as fresh — and the one thing the screen
// depends on, that the requested scale carries the device pixel ratio.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EngineTransport } from '../engine/transport';
import { outcome, SOURCE } from '../testkit/fixtures';
import { usePreviewSession } from './usePreviewSession';

const AT = 'sections.body.items[0]';

function transport(): EngineTransport {
  return {
    validate: vi.fn(async () => ({ items: [] })),
    renderRaw: vi.fn(async () => outcome({ items: [] })),
  };
}

/** jsdom reports 1 and has no way to change displays; the property is
 * configurable, so it can be redefined and put back. */
function setPixelRatio(value: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });
}

function session(engineOut?: { engine?: EngineTransport }) {
  // The transport is created ONCE and captured: `usePreview` keys its effect on
  // the transport identity, so a fresh object per render re-renders forever
  // (it exhausts the heap rather than failing an assertion).
  const engine = transport();
  if (engineOut !== undefined) {
    engineOut.engine = engine;
  }
  return renderHook(() =>
    usePreviewSession({
      transport: engine,
      text: SOURCE,
      params: '{}',
      definitions: undefined,
      baseScale: 1,
      maxBytes: 2 * 1024 * 1024,
    }),
  );
}

describe('usePreviewSession freshness', () => {
  it('is fresh once a render of the committed document lands', async () => {
    const { result } = session();
    await waitFor(() => expect(result.current.fresh).toBe(true));
  });

  it('is NOT fresh while the render is of an uncommitted edit', async () => {
    // `fresh` gates every action that authors numbers measured off the last
    // render (today: the placement pin). Those surfaces cannot currently be on
    // screen beside the text field — the panel's tabs are exclusive — so this
    // is the invariant holding the meaning of `fresh`, not a live defect being
    // fixed. It is asserted here because nothing in the UI can reach it.
    const { result } = session();
    await waitFor(() => expect(result.current.fresh).toBe(true));
    act(() =>
      result.current.setDraftOps([{ op: 'setScalar', path: AT, keys: ['text'], value: 'draft' }]),
    );
    // The derivation is debounced (a draft costs a full re-parse), so freshness
    // drops once the draft actually lands rather than on the publish.
    await waitFor(() => expect(result.current.fresh).toBe(false));
    await waitFor(() => expect(result.current.preview.lastGood).not.toBeNull());
    expect(result.current.fresh).toBe(false);
  });

  it('is fresh again when the edit is withdrawn', async () => {
    const { result } = session();
    act(() =>
      result.current.setDraftOps([{ op: 'setScalar', path: AT, keys: ['text'], value: 'draft' }]),
    );
    await waitFor(() => expect(result.current.fresh).toBe(false));
    act(() => result.current.setDraftOps(null));
    await waitFor(() => expect(result.current.fresh).toBe(true));
  });
});

describe('usePreviewSession render scale', () => {
  afterEach(() => {
    setPixelRatio(1);
  });

  it('asks the engine for a scale that carries the device pixel ratio', async () => {
    setPixelRatio(2);
    const held: { engine?: EngineTransport } = {};
    const { result } = session(held);
    await waitFor(() => expect(result.current.preview.lastGood).not.toBeNull());
    // baseScale 1 × the opening zoom 1 × ratio 2.
    const call = vi.mocked(held.engine?.renderRaw as EngineTransport['renderRaw']).mock.calls[0];
    expect(call?.[3]).toEqual({ scale: 2 });
    // And the ratio is reported, so the canvas can divide the raster back down.
    expect(result.current.pixelRatio).toBe(2);
  });

  it('asks for the base scale on a 1× screen', async () => {
    const held: { engine?: EngineTransport } = {};
    const { result } = session(held);
    await waitFor(() => expect(result.current.preview.lastGood).not.toBeNull());
    const call = vi.mocked(held.engine?.renderRaw as EngineTransport['renderRaw']).mock.calls[0];
    expect(call?.[3]).toEqual({ scale: 1 });
    expect(result.current.pixelRatio).toBe(1);
  });
});
