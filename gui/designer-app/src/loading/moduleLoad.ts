// The app-global engine-module load, as something React can watch. The wasm
// module is the biggest single thing the app downloads and it no longer gates
// the first paint — the catalog renders while the module is still arriving — so
// its progress has to be observable from chrome that is already on screen.
//
// Pure: no fetch, no ReadableStream, no React. The browser glue
// (`src/browser/moduleFetch.ts`) owns the stream plumbing and only ever tells
// this tracker "expect N bytes" / "M more arrived" / "done" / "failed", which
// keeps every accumulation and terminal-state rule here, under the coverage
// gate. Shaped for `useSyncExternalStore`: `get` returns a stable reference
// between changes, `subscribe` hands back its own removal.

import type { ByteProgress } from './progress';

/** Where the engine module is. `loading` carries whatever the transfer has
 * reported so far (indeterminate until a usable `Content-Length` lands);
 * `failed` is terminal and exists so the wait can never present as an
 * unending spinner — a mounted app talking to a real server treats "the fetch
 * rejected" as a normal day. */
export type ModuleLoad =
  | { readonly kind: 'loading'; readonly bytes: ByteProgress }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed' };

/** The read side — what a component subscribes to. */
export interface ModuleLoadSource {
  subscribe(listener: () => void): () => void;
  get(): ModuleLoad;
}

/** The write side, driven by the browser glue that performs the fetch. */
export interface ModuleLoadTracker extends ModuleLoadSource {
  /** Declares the expected transfer size; `undefined` when the server sent no
   * usable `Content-Length` (chunked encoding), which leaves the reading
   * indeterminate rather than guessing. */
  expect(total: number | undefined): void;
  /** Adds one delivered chunk's bytes to the running total. */
  advance(chunkBytes: number): void;
  finish(): void;
  fail(): void;
}

/** Parse a `Content-Length` header into a usable total, or `undefined`.
 *
 * Everything that is not a plain non-negative integer becomes `undefined`: a
 * missing header, a non-numeric one, a negative or fractional value, and the
 * shapes `Number()` is too lenient about on its own (`''` → 0, `'0x10'` → 16,
 * `'  12  '` → 12, `'Infinity'` → Infinity). A wrong total is worse than no
 * total, because a bar that lies is read as a broken app. */
export function parseContentLength(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header)) {
    return undefined;
  }
  const total = Number(header);
  return Number.isSafeInteger(total) && total > 0 ? total : undefined;
}

/** A fresh tracker, starting in `loading` with nothing yet reported.
 *
 * `ready` and `failed` are TERMINAL: a late `expect`/`advance` after either is
 * ignored, so a straggling chunk can never reopen a loading view the user has
 * already moved past. */
export function moduleLoadTracker(): ModuleLoadTracker {
  const listeners = new Set<() => void>();
  let state: ModuleLoad = { kind: 'loading', bytes: { loaded: 0 } };
  let loaded = 0;
  let total: number | undefined;

  const publish = (next: ModuleLoad): void => {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  };
  // A hostile or absurd chunk size (a non-finite `byteLength`) is NOT guarded
  // here: it flows into `loaded` and `readProgress` degrades the reading to
  // indeterminate, so the degradation lives in exactly one place.
  const republish = (): void => {
    publish({ kind: 'loading', bytes: { loaded, total } });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get() {
      return state;
    },
    expect(bytes) {
      if (state.kind !== 'loading') {
        return;
      }
      total = bytes;
      republish();
    },
    advance(chunkBytes) {
      if (state.kind !== 'loading') {
        return;
      }
      loaded += chunkBytes;
      republish();
    },
    finish() {
      publish({ kind: 'ready' });
    },
    fail() {
      publish({ kind: 'failed' });
    },
  };
}
