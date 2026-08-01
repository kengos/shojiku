// @vitest-environment node
// Node env on purpose: the subject is `Response`/`ReadableStream` plumbing
// (Node's own globals), not DOM behavior — the same posture as the real-engine
// integration suites.

import { describe, expect, it, vi } from 'vitest';
import { moduleLoadTracker } from './moduleLoad';
import { observeResponse } from './observe';

/** A Response whose body delivers `chunks` in order. */
function streamedResponse(chunks: readonly Uint8Array[], headers: Record<string, string>) {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i]);
        i += 1;
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { headers });
}

/** Drain a response's body completely, returning the total bytes read. */
async function drain(res: Response): Promise<number> {
  const reader = res.body;
  if (reader === null) {
    throw new Error('expected a body');
  }
  const r = reader.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) {
      return total;
    }
    total += value.byteLength;
  }
}

describe('observeResponse', () => {
  it('declares the Content-Length total, then advances per delivered chunk', async () => {
    const tracker = moduleLoadTracker();
    const observed = observeResponse(
      streamedResponse([new Uint8Array(600), new Uint8Array(400)], {
        'content-length': '1000',
      }),
      tracker,
    );
    // The total is known before any byte lands — a bar can size itself
    // immediately.
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 0, total: 1000 } });
    expect(await drain(observed)).toBe(1000);
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 1000, total: 1000 } });
  });

  it('leaves the reading indeterminate when no usable Content-Length arrived', async () => {
    const tracker = moduleLoadTracker();
    const observed = observeResponse(streamedResponse([new Uint8Array(64)], {}), tracker);
    await drain(observed);
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 64, total: undefined } });
  });

  it('passes the bytes through unaltered while counting them', async () => {
    const tracker = moduleLoadTracker();
    const observed = observeResponse(
      streamedResponse([new Uint8Array([1, 2, 3])], { 'content-length': '3' }),
      tracker,
    );
    expect(new Uint8Array(await observed.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('preserves the headers and status the streaming compile depends on', () => {
    const tracker = moduleLoadTracker();
    const observed = observeResponse(
      streamedResponse([], { 'content-type': 'application/wasm', 'content-length': '0' }),
      tracker,
    );
    expect(observed.headers.get('content-type')).toBe('application/wasm');
    expect(observed.status).toBe(200);
  });

  // No ReadableStream to observe: the response is returned AS-IS (no progress,
  // never a failed load), though the header still declares the total.
  it('returns a body-less response untouched', () => {
    const tracker = moduleLoadTracker();
    const res = new Response(null, { headers: { 'content-length': '1000' } });
    expect(observeResponse(res, tracker)).toBe(res);
    expect(tracker.get()).toEqual({ kind: 'loading', bytes: { loaded: 0, total: 1000 } });
  });

  it('propagates a cancel to the underlying stream', async () => {
    const cancelled = vi.fn();
    const tracker = moduleLoadTracker();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        // Never delivers — the consumer gives up instead.
      },
      cancel: cancelled,
    });
    const observed = observeResponse(new Response(body), tracker);
    const reader = observed.body;
    if (reader === null) {
      throw new Error('expected a body');
    }
    await reader.cancel('gave up');
    expect(cancelled).toHaveBeenCalledWith('gave up');
  });
});
