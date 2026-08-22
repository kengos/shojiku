// The freshness half of the preview session. The render loop itself is covered
// by `preview/usePreview`; what is asserted here is the one thing composing the
// draft changed — a render of UNCOMMITTED text is never reported as fresh.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

function session() {
  // The transport is created ONCE and captured: `usePreview` keys its effect on
  // the transport identity, so a fresh object per render re-renders forever
  // (it exhausts the heap rather than failing an assertion).
  const engine = transport();
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
