// Observing the engine-module transfer: what an already-fetched `Response`
// MEANS for the tracker, and how its bytes are counted through without being
// buffered. Pure over an injected `Response` — `fetch` itself stays in the
// browser glue (`src/browser/moduleFetch.ts`), so every rule here (the header
// parse, the null-body passthrough, per-chunk accounting, cancel delegation)
// is unit-testable and carries the 100% gate.
//
// The body is re-wrapped rather than buffered: `instantiateStreaming` compiles
// as the bytes land, and handing the init an already-`arrayBuffer()`ed module
// would trade that away for the progress.

import { type ModuleLoadTracker, parseContentLength } from './moduleLoad';

/** Report `res`'s transfer to `tracker` and return a `Response` the wasm-bindgen
 * init can still compile in a streaming fashion.
 *
 * The original headers ride along deliberately: `WebAssembly.instantiateStreaming`
 * requires `Content-Type: application/wasm` and drops to a slower buffered
 * compile (with a console warning) without it. A body-less response — no
 * `ReadableStream` to observe — is returned as-is: no progress, never a failed
 * load. */
export function observeResponse(res: Response, tracker: ModuleLoadTracker): Response {
  tracker.expect(parseContentLength(res.headers.get('content-length')));
  const body = res.body;
  if (body === null) {
    return res;
  }
  const reader = body.getReader();
  const observed = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      tracker.advance(value.byteLength);
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return new Response(observed, { headers: res.headers, status: res.status });
}
